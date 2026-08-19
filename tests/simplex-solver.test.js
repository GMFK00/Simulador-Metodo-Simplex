import assert from 'node:assert/strict';
import test from 'node:test';

import { solve } from '../simplex-solver.js';

const OPTIONS = { captureSteps: false };
const TOLERANCE = 1e-6;

function assertApprox(actual, expected, tolerance = TOLERANCE) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `esperado ${expected}, recebido ${actual}`
    );
}

function solveWithoutSteps(C, A, b, objectiveType, relations) {
    return solve(C, A, b, objectiveType, C.length, relations, OPTIONS);
}

function exactTwoDimensionalOptimum(C, A, b, relations, objectiveType) {
    const lines = [
        ...A.map((coefficients, index) => ({ coefficients, rhs: b[index] })),
        { coefficients: [1, 0], rhs: 0 },
        { coefficients: [0, 1], rhs: 0 },
    ];
    const candidates = [];

    for (let first = 0; first < lines.length; first++) {
        for (let second = first + 1; second < lines.length; second++) {
            const [a, c] = lines[first].coefficients;
            const [d, e] = lines[second].coefficients;
            const determinant = a * e - c * d;
            if (Math.abs(determinant) <= 1e-10) continue;
            candidates.push([
                (lines[first].rhs * e - c * lines[second].rhs) / determinant,
                (a * lines[second].rhs - lines[first].rhs * d) / determinant,
            ]);
        }
    }

    const feasible = candidates.filter(point => {
        if (point.some(value => value < -TOLERANCE)) return false;
        return A.every((row, index) => {
            const lhs = row[0] * point[0] + row[1] * point[1];
            if (relations[index] === '<=') return lhs <= b[index] + TOLERANCE;
            if (relations[index] === '>=') return lhs >= b[index] - TOLERANCE;
            return Math.abs(lhs - b[index]) <= TOLERANCE;
        });
    });

    assert.ok(feasible.length > 0, 'o comparador independente esperava uma região viável');
    const score = point => C[0] * point[0] + C[1] * point[1];
    return feasible.reduce((best, point) => {
        if (objectiveType === 'maximize') return score(point) > score(best) ? point : best;
        return score(point) < score(best) ? point : best;
    });
}

test('resolve uma maximização clássica com restrições <=', () => {
    const result = solveWithoutSteps(
        [3, 2],
        [[1, 1], [1, 0], [0, 1]],
        [4, 2, 3],
        'maximize',
        ['<=', '<=', '<=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.variables.x1, 2);
    assertApprox(result.solution.variables.x2, 2);
    assertApprox(result.solution.zValue, 10);
});

test('usa duas fases em uma minimização com restrições >=', () => {
    const result = solveWithoutSteps(
        [1, 1],
        [[1, 2], [4, 2]],
        [4, 12],
        'minimize',
        ['>=', '>=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.variables.x1, 8 / 3);
    assertApprox(result.solution.variables.x2, 2 / 3);
    assertApprox(result.solution.zValue, 10 / 3);
    assert.ok(result.diagnostics.phaseOneIterations > 0);
});

test('remove a variável artificial de uma restrição de igualdade', () => {
    const result = solveWithoutSteps(
        [3, 2],
        [[1, 1]],
        [4],
        'maximize',
        ['=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.variables.x1, 4);
    assertApprox(result.solution.variables.x2, 0);
    assertApprox(result.solution.zValue, 12);
});

test('normaliza lado direito negativo e inverte a desigualdade', () => {
    const result = solveWithoutSteps(
        [1],
        [[-1], [1]],
        [-2, 5],
        'maximize',
        ['<=', '<=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.variables.x1, 5);
    assert.equal(result.diagnostics.normalizedRows, 1);
});

test('classifica restrições contraditórias como inviáveis', () => {
    const result = solveWithoutSteps(
        [1],
        [[1], [1]],
        [1, 2],
        'maximize',
        ['<=', '>=']
    );

    assert.equal(result.success, false);
    assert.equal(result.status, 'infeasible');
});

test('classifica corretamente um problema ilimitado', () => {
    const result = solveWithoutSteps(
        [1, 1],
        [[1, -1]],
        [1],
        'maximize',
        ['<=']
    );

    assert.equal(result.success, false);
    assert.equal(result.status, 'unbounded');
});

test('aceita uma base degenerada e termina sem ciclo', () => {
    const result = solveWithoutSteps(
        [1, 1],
        [[1, 0], [0, 1], [1, 1]],
        [2, 2, 2],
        'maximize',
        ['<=', '<=', '<=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.zValue, 2);
    assert.equal(result.diagnostics.cycleDetected, false);
});

test('a regra de Bland resolve o exemplo clássico de ciclagem', () => {
    const result = solveWithoutSteps(
        [10, -57, -9, -24],
        [
            [0.5, -5.5, -2.5, 9],
            [0.5, -1.5, -0.5, 1],
            [1, 0, 0, 0],
        ],
        [0, 0, 1],
        'maximize',
        ['<=', '<=', '<=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.zValue, 1);
    assert.equal(result.diagnostics.cycleDetected, false);
    assert.ok(result.diagnostics.degeneratePivots > 0);
});

test('remove uma igualdade redundante ao encerrar a Fase I', () => {
    const result = solveWithoutSteps(
        [1, 1],
        [[1, 1], [2, 2], [1, 0]],
        [2, 4, 2],
        'maximize',
        ['=', '=', '<=']
    );

    assert.equal(result.status, 'optimal');
    assertApprox(result.solution.zValue, 2);
    assert.ok(result.diagnostics.redundantRows >= 1);
});

test('coincide com enumeração independente de vértices em 120 problemas 2D', () => {
    let state = 0x51a9e37;
    const random = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };

    for (let sample = 0; sample < 120; sample++) {
        const upperX = 2 + Math.floor(random() * 9);
        const upperY = 2 + Math.floor(random() * 9);
        const a = 1 + Math.floor(random() * 5);
        const c = 1 + Math.floor(random() * 5);
        const cap = Math.max(a * upperX, c * upperY) + Math.floor(random() * 5);
        const C = [1 + Math.floor(random() * 8), 1 + Math.floor(random() * 8)];
        const A = [[1, 0], [0, 1], [a, c]];
        const b = [upperX, upperY, cap];
        const relations = ['<=', '<=', '<='];
        const objectiveType = sample % 2 === 0 ? 'maximize' : 'minimize';

        if (objectiveType === 'minimize') {
            const lower = Math.min(upperX, upperY) * (0.25 + random() * 0.5);
            A.push([1, 1]);
            b.push(lower);
            relations.push('>=');
        }

        const expectedPoint = exactTwoDimensionalOptimum(C, A, b, relations, objectiveType);
        const expectedValue = C[0] * expectedPoint[0] + C[1] * expectedPoint[1];
        const result = solveWithoutSteps(C, A, b, objectiveType, relations);

        assert.equal(result.status, 'optimal', `amostra ${sample}`);
        assertApprox(result.solution.zValue, expectedValue, 1e-5);
    }
});
