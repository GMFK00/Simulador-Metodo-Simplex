const EPSILON = 1e-9;
const FEASIBILITY_TOLERANCE = 1e-7;
const DEFAULT_MAX_ITERATIONS = 200;

const RELATION_ALIASES = Object.freeze({
    '<=': '<=',
    '≤': '<=',
    '>=': '>=',
    '≥': '>=',
    '=': '=',
});

function cleanNumber(value) {
    return Math.abs(value) < EPSILON ? 0 : value;
}

function cloneTableau(tableau) {
    return tableau.map(row => row.map(cleanNumber));
}

function invertRelation(relation) {
    if (relation === '<=') return '>=';
    if (relation === '>=') return '<=';
    return '=';
}

function validateAndNormalize(C, A, b, objectiveType, numVars, relations) {
    if (!Array.isArray(C) || !Array.isArray(A) || !Array.isArray(b)) {
        throw new TypeError('C, A e b devem ser arrays.');
    }
    if (!['maximize', 'minimize'].includes(objectiveType)) {
        throw new RangeError('O tipo do objetivo deve ser maximize ou minimize.');
    }
    if (!Number.isInteger(numVars) || numVars < 1 || C.length !== numVars) {
        throw new RangeError('A quantidade de variáveis deve coincidir com a função objetivo.');
    }
    if (A.length < 1 || A.length !== b.length) {
        throw new RangeError('A matriz A e o vetor b devem possuir a mesma quantidade de restrições.');
    }

    const normalizedRelations = relations ?? Array(A.length).fill('<=');
    if (!Array.isArray(normalizedRelations) || normalizedRelations.length !== A.length) {
        throw new RangeError('Deve haver uma relação para cada restrição.');
    }

    const normalizations = [];
    const constraints = A.map((sourceRow, index) => {
        if (!Array.isArray(sourceRow) || sourceRow.length !== numVars) {
            throw new RangeError(`A restrição ${index + 1} possui dimensão inválida.`);
        }

        const coefficients = sourceRow.map(Number);
        let rhs = Number(b[index]);
        let relation = RELATION_ALIASES[normalizedRelations[index]];

        if (!coefficients.every(Number.isFinite) || !Number.isFinite(rhs)) {
            throw new RangeError(`A restrição ${index + 1} contém um valor não finito.`);
        }
        if (!relation) {
            throw new RangeError(`A relação da restrição ${index + 1} é inválida.`);
        }

        if (rhs < -EPSILON) {
            for (let column = 0; column < coefficients.length; column++) {
                coefficients[column] = -coefficients[column];
            }
            rhs = -rhs;
            const previousRelation = relation;
            relation = invertRelation(relation);
            normalizations.push({ index, previousRelation, relation });
        }

        return {
            coefficients: coefficients.map(cleanNumber),
            relation,
            rhs: cleanNumber(rhs),
        };
    });

    const objective = C.map(Number);
    if (!objective.every(Number.isFinite)) {
        throw new RangeError('A função objetivo contém um valor não finito.');
    }

    return { constraints, normalizations, objective };
}

function buildInitialSystem(constraints, numVars) {
    const variables = Array.from({ length: numVars }, (_, index) => ({
        name: `x${index + 1}`,
        kind: 'original',
        originalIndex: index,
    }));
    const rows = constraints.map(constraint => ({
        coefficients: [...constraint.coefficients],
        rhs: constraint.rhs,
        basis: -1,
    }));
    const artificialIndices = new Set();

    function addVariable(metadata) {
        const index = variables.length;
        variables.push(metadata);
        rows.forEach(row => row.coefficients.push(0));
        return index;
    }

    constraints.forEach((constraint, rowIndex) => {
        if (constraint.relation === '<=') {
            const slack = addVariable({ name: `f${rowIndex + 1}`, kind: 'slack' });
            rows[rowIndex].coefficients[slack] = 1;
            rows[rowIndex].basis = slack;
            return;
        }

        if (constraint.relation === '>=') {
            const surplus = addVariable({ name: `e${rowIndex + 1}`, kind: 'surplus' });
            rows[rowIndex].coefficients[surplus] = -1;
        }

        const artificial = addVariable({ name: `a${rowIndex + 1}`, kind: 'artificial' });
        rows[rowIndex].coefficients[artificial] = 1;
        rows[rowIndex].basis = artificial;
        artificialIndices.add(artificial);
    });

    return {
        rows: rows.map(row => [...row.coefficients, row.rhs]),
        basis: rows.map(row => row.basis),
        variables,
        artificialIndices,
    };
}

function createCanonicalObjective(rows, basis, costs) {
    const objectiveRow = costs.map(cost => -cost).concat(0);

    basis.forEach((basicVariable, rowIndex) => {
        const basicCost = costs[basicVariable] ?? 0;
        if (Math.abs(basicCost) <= EPSILON) return;
        for (let column = 0; column < objectiveRow.length; column++) {
            objectiveRow[column] += basicCost * rows[rowIndex][column];
        }
    });

    return objectiveRow.map(cleanNumber);
}

function pivot(tableau, basis, pivotRowIndex, pivotColumnIndex) {
    const pivotElement = tableau[pivotRowIndex][pivotColumnIndex];
    const columnCount = tableau[0].length;

    for (let column = 0; column < columnCount; column++) {
        tableau[pivotRowIndex][column] /= pivotElement;
        tableau[pivotRowIndex][column] = cleanNumber(tableau[pivotRowIndex][column]);
    }

    for (let row = 0; row < tableau.length; row++) {
        if (row === pivotRowIndex) continue;
        const factor = tableau[row][pivotColumnIndex];
        if (Math.abs(factor) <= EPSILON) continue;
        for (let column = 0; column < columnCount; column++) {
            tableau[row][column] -= factor * tableau[pivotRowIndex][column];
            tableau[row][column] = cleanNumber(tableau[row][column]);
        }
    }

    basis[pivotRowIndex] = pivotColumnIndex;
}

function addTableauStep(steps, enabled, title, tableau, variables, basis, pivotInfo = null) {
    if (!enabled) return;
    steps.push({
        type: 'tableau',
        title,
        tableau: cloneTableau(tableau),
        columns: variables.map(variable => variable.name),
        basis: basis.map(index => variables[index]?.name ?? '—'),
        pivotInfo,
    });
}

function addExplanation(steps, enabled, title, content) {
    if (!enabled) return;
    steps.push({ type: 'explanation', title, content });
}

function runSimplex({
    tableau,
    basis,
    variables,
    phase,
    steps,
    captureSteps,
    diagnostics,
    maxIterations,
}) {
    const seenBases = new Set();
    const variableCount = variables.length;
    const rhsIndex = variableCount;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
        const signature = basis.join(',');
        if (seenBases.has(signature)) {
            diagnostics.cycleDetected = true;
            return { status: 'numerical_failure', iterations: iteration - 1 };
        }
        seenBases.add(signature);

        const objectiveRow = tableau[tableau.length - 1];
        let enteringColumn = -1;
        for (let column = 0; column < variableCount; column++) {
            if (objectiveRow[column] < -EPSILON) {
                enteringColumn = column;
                break;
            }
        }

        if (enteringColumn === -1) {
            return { status: 'optimal', iterations: iteration - 1 };
        }

        const candidates = [];
        for (let row = 0; row < tableau.length - 1; row++) {
            const coefficient = tableau[row][enteringColumn];
            if (coefficient > EPSILON) {
                candidates.push({
                    row,
                    ratio: Math.max(0, tableau[row][rhsIndex]) / coefficient,
                    leavingVariable: basis[row],
                });
            }
        }

        if (candidates.length === 0) {
            return { status: 'unbounded', iterations: iteration - 1 };
        }

        const minimumRatio = Math.min(...candidates.map(candidate => candidate.ratio));
        const tiedCandidates = candidates.filter(candidate =>
            Math.abs(candidate.ratio - minimumRatio) <= FEASIBILITY_TOLERANCE
        );
        tiedCandidates.sort((left, right) => left.leavingVariable - right.leavingVariable);
        const leaving = tiedCandidates[0];

        if (minimumRatio <= FEASIBILITY_TOLERANCE) {
            diagnostics.degeneratePivots++;
        }

        addExplanation(
            steps,
            captureSteps,
            `${phase} — Iteração ${iteration}`,
            `Pela regra de Bland, <strong>${variables[enteringColumn].name}</strong> entra na base e ` +
            `<strong>${variables[leaving.leavingVariable].name}</strong> sai. ` +
            `A menor razão não negativa é <strong>${minimumRatio.toFixed(6)}</strong>.`
        );
        addTableauStep(
            steps,
            captureSteps,
            `${phase} — Antes do pivoteamento ${iteration}`,
            tableau,
            variables,
            basis,
            { row: leaving.row, col: enteringColumn }
        );

        pivot(tableau, basis, leaving.row, enteringColumn);
        diagnostics.totalPivots++;

        addTableauStep(
            steps,
            captureSteps,
            `${phase} — Após o pivoteamento ${iteration}`,
            tableau,
            variables,
            basis
        );
    }

    return { status: 'iteration_limit', iterations: maxIterations };
}

function removeArtificialVariables(tableau, basis, variables, artificialIndices) {
    for (let row = 0; row < basis.length; row++) {
        if (!artificialIndices.has(basis[row])) continue;

        let enteringColumn = -1;
        for (let column = 0; column < variables.length; column++) {
            if (!artificialIndices.has(column) && Math.abs(tableau[row][column]) > EPSILON) {
                enteringColumn = column;
                break;
            }
        }

        if (enteringColumn !== -1) {
            pivot(tableau, basis, row, enteringColumn);
        }
    }

    const redundantRows = [];
    for (let row = 0; row < basis.length; row++) {
        if (!artificialIndices.has(basis[row])) continue;
        const hasNonArtificialCoefficient = variables.some((_, column) =>
            !artificialIndices.has(column) && Math.abs(tableau[row][column]) > EPSILON
        );
        if (!hasNonArtificialCoefficient && Math.abs(tableau[row][variables.length]) <= FEASIBILITY_TOLERANCE) {
            redundantRows.push(row);
        }
    }

    for (let index = redundantRows.length - 1; index >= 0; index--) {
        const row = redundantRows[index];
        tableau.splice(row, 1);
        basis.splice(row, 1);
    }

    const retainedColumns = [];
    const oldToNew = new Map();
    variables.forEach((_, column) => {
        if (!artificialIndices.has(column)) {
            oldToNew.set(column, retainedColumns.length);
            retainedColumns.push(column);
        }
    });

    const rhsIndex = variables.length;
    const reducedRows = tableau.slice(0, -1).map(row => [
        ...retainedColumns.map(column => row[column]),
        row[rhsIndex],
    ]);
    const reducedBasis = basis.map(column => oldToNew.get(column));
    const reducedVariables = retainedColumns.map(column => variables[column]);

    if (reducedBasis.some(column => column === undefined)) {
        return { status: 'infeasible' };
    }

    return {
        status: 'ok',
        rows: reducedRows,
        basis: reducedBasis,
        variables: reducedVariables,
        redundantRows: redundantRows.length,
    };
}

function evaluateConstraint(coefficients, point) {
    return coefficients.reduce((sum, coefficient, index) => sum + coefficient * point[index], 0);
}

function isOriginalProblemFeasible(A, b, relations, point) {
    if (point.some(value => value < -FEASIBILITY_TOLERANCE)) return false;
    return A.every((row, index) => {
        const lhs = evaluateConstraint(row, point);
        const relation = RELATION_ALIASES[relations[index]];
        if (relation === '<=') return lhs <= b[index] + FEASIBILITY_TOLERANCE;
        if (relation === '>=') return lhs >= b[index] - FEASIBILITY_TOLERANCE;
        return Math.abs(lhs - b[index]) <= FEASIBILITY_TOLERANCE;
    });
}

function failureResult(status, steps, diagnostics, customMessage) {
    const messages = {
        infeasible: 'O problema é inviável: não existe ponto que satisfaça todas as restrições.',
        unbounded: 'O problema é ilimitado: a função objetivo pode melhorar sem limite.',
        iteration_limit: 'O limite de iterações foi atingido antes da conclusão.',
        numerical_failure: 'O solver encontrou uma falha numérica ou repetição inesperada da base.',
    };
    return {
        success: false,
        status,
        message: customMessage ?? messages[status],
        steps,
        diagnostics,
    };
}

/**
 * Resolve um problema de programação linear pelo Simplex de duas fases.
 * Todas as variáveis originais são consideradas não negativas.
 */
export function solve(
    C,
    A,
    b,
    objectiveType,
    numVars = C?.length,
    relations = Array(A?.length ?? 0).fill('<='),
    options = {}
) {
    const captureSteps = options.captureSteps !== false;
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const steps = [];
    const diagnostics = {
        phaseOneIterations: 0,
        phaseTwoIterations: 0,
        totalPivots: 0,
        degeneratePivots: 0,
        cycleDetected: false,
        normalizedRows: 0,
        redundantRows: 0,
    };

    const { constraints, normalizations, objective } = validateAndNormalize(
        C, A, b, objectiveType, numVars, relations
    );
    diagnostics.normalizedRows = normalizations.length;

    normalizations.forEach(normalization => {
        addExplanation(
            steps,
            captureSteps,
            `Normalização da restrição ${normalization.index + 1}`,
            `Como o lado direito era negativo, toda a linha foi multiplicada por -1 e a relação ` +
            `<strong>${normalization.previousRelation}</strong> foi convertida em ` +
            `<strong>${normalization.relation}</strong>.`
        );
    });

    const initial = buildInitialSystem(constraints, numVars);
    let { rows, basis, variables, artificialIndices } = initial;
    let tableau;

    if (artificialIndices.size > 0) {
        addExplanation(
            steps,
            captureSteps,
            'Fase I — Busca de uma base viável',
            'Foram adicionadas variáveis artificiais. A Fase I maximiza o negativo da soma dessas ' +
            'variáveis; o valor final precisa ser zero para o problema original ser viável.'
        );

        const phaseOneCosts = variables.map((_, index) => artificialIndices.has(index) ? -1 : 0);
        tableau = [...rows, createCanonicalObjective(rows, basis, phaseOneCosts)];
        addTableauStep(steps, captureSteps, 'Fase I — Tableau inicial', tableau, variables, basis);

        const phaseOne = runSimplex({
            tableau,
            basis,
            variables,
            phase: 'Fase I',
            steps,
            captureSteps,
            diagnostics,
            maxIterations,
        });
        diagnostics.phaseOneIterations = phaseOne.iterations;

        if (phaseOne.status !== 'optimal') {
            return failureResult(phaseOne.status, steps, diagnostics);
        }

        const phaseOneValue = tableau[tableau.length - 1][variables.length];
        const artificialSum = Math.max(0, -phaseOneValue);
        if (artificialSum > FEASIBILITY_TOLERANCE) {
            addExplanation(
                steps,
                captureSteps,
                'Conclusão da Fase I',
                `A soma mínima das variáveis artificiais foi ` +
                `<strong>${artificialSum.toFixed(8)}</strong>, portanto o problema é inviável.`
            );
            return failureResult('infeasible', steps, diagnostics);
        }

        const reduced = removeArtificialVariables(tableau, basis, variables, artificialIndices);
        if (reduced.status !== 'ok') {
            return failureResult('infeasible', steps, diagnostics);
        }
        rows = reduced.rows;
        basis = reduced.basis;
        variables = reduced.variables;
        diagnostics.redundantRows = reduced.redundantRows;

        addExplanation(
            steps,
            captureSteps,
            'Transição para a Fase II',
            'A Fase I terminou com valor zero. As variáveis artificiais foram removidas e a função ' +
            'objetivo original foi restaurada.'
        );
    } else {
        addExplanation(
            steps,
            captureSteps,
            'Base inicial',
            'As variáveis de folga já formam uma base viável; por isso a Fase I não é necessária.'
        );
    }

    const maximizationObjective = objectiveType === 'maximize'
        ? objective
        : objective.map(value => -value);
    const phaseTwoCosts = variables.map(variable =>
        variable.kind === 'original' ? maximizationObjective[variable.originalIndex] : 0
    );
    tableau = [...rows, createCanonicalObjective(rows, basis, phaseTwoCosts)];
    addTableauStep(steps, captureSteps, 'Fase II — Tableau inicial', tableau, variables, basis);

    const phaseTwo = runSimplex({
        tableau,
        basis,
        variables,
        phase: 'Fase II',
        steps,
        captureSteps,
        diagnostics,
        maxIterations,
    });
    diagnostics.phaseTwoIterations = phaseTwo.iterations;

    if (phaseTwo.status !== 'optimal') {
        return failureResult(phaseTwo.status, steps, diagnostics);
    }

    const rhsIndex = variables.length;
    const point = Array(numVars).fill(0);
    basis.forEach((variableIndex, rowIndex) => {
        const variable = variables[variableIndex];
        if (variable?.kind === 'original') {
            point[variable.originalIndex] = cleanNumber(tableau[rowIndex][rhsIndex]);
        }
    });

    if (!isOriginalProblemFeasible(A, b, relations, point)) {
        return failureResult(
            'numerical_failure',
            steps,
            diagnostics,
            'A solução calculada não passou pela validação final das restrições.'
        );
    }

    const variablesResult = Object.fromEntries(
        point.map((value, index) => [`x${index + 1}`, Number(cleanNumber(value).toFixed(8))])
    );
    const zValue = objective.reduce((sum, coefficient, index) =>
        sum + coefficient * point[index], 0
    );

    addExplanation(
        steps,
        captureSteps,
        'Condição de parada',
        'Não há custo reduzido negativo na linha objetivo. A solução básica atual é ótima.'
    );

    return {
        success: true,
        status: 'optimal',
        solution: {
            variables: variablesResult,
            zValue: Number(cleanNumber(zValue).toFixed(8)),
            objectiveText: objectiveType === 'maximize' ? 'Valor máximo' : 'Valor mínimo',
        },
        steps,
        diagnostics,
    };
}
