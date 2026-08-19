
import { solve } from './simplex-solver.js';

document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const numVarsInput = document.getElementById('num-vars');
    const numConstraintsInput = document.getElementById('num-constraints');
    const generateFieldsBtn = document.getElementById('btn-generate-fields');
    const randomFillBtn = document.getElementById('btn-random-fill');
    const simplexForm = document.getElementById('simplex-form');
    const objectiveTypeSelect = document.getElementById('objective-type');
    const objectiveLegend = document.getElementById('objective-legend');
    const objectiveFunctionDiv = document.getElementById('objective-function');
    const constraintsDiv = document.getElementById('constraints');
    const resultsSection = document.getElementById('results');
    const stepsOutput = document.getElementById('steps-output');
    const solutionOutput = document.getElementById('solution-output');

    // Event Listeners
    generateFieldsBtn.addEventListener('click', generateInputFields);
    randomFillBtn.addEventListener('click', fillWithRandomData);
    simplexForm.addEventListener('submit', handleSolve);
    simplexForm.addEventListener('reset', handleReset);
    objectiveTypeSelect.addEventListener('change', () => {
        const type = objectiveTypeSelect.value === 'maximize' ? 'Maximizar' : 'Minimizar';
        objectiveLegend.textContent = `Função Objetivo (${type} Z)`;
    });

    // Função para o clique no botão "Resolver"
    function handleSolve(event) {
        event.preventDefault();
        if (!validateInputs()) return;

        const objectiveType = objectiveTypeSelect.value;
        const numVars = parseInt(numVarsInput.value);
        
        try {
            const { C, A, b, relations } = parseInputs();
            const result = solve(C, A, b, objectiveType, numVars, relations);

            // Limpa saídas anteriores
            stepsOutput.innerHTML = '';
            solutionOutput.innerHTML = '';

            // Renderização dos passos
            result.steps.forEach(step => {
                if (step.type === 'explanation') {
                    printExplanation(step.title, step.content);
                } else if (step.type === 'tableau') {
                    printTableau(
                        step.tableau,
                        step.title,
                        step.columns,
                        step.basis,
                        step.pivotInfo
                    );
                }
            });

            // Renderização da solução final ou a mensagem de erro
            if (result.success) {
                printSolution(result.solution, result.diagnostics);
            } else {
                solutionOutput.className = 'result-card result-error';
                solutionOutput.innerHTML = `
                    <p><strong>${statusLabel(result.status)}</strong></p>
                    <p>${result.message}</p>
                `;
            }

            resultsSection.classList.remove('hidden');
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            alert("Erro inesperado ao resolver: " + error.message);
        }
    }

    // Funções de renderização no DOM
    function printExplanation(title, content) {
        stepsOutput.innerHTML += `<div class="explanation"><strong>${title}</strong><br>${content}</div>`;
    }

    function printTableau(tableau, title, columns, basis, pivotInfo = null) {
        let html = `<strong>${title}:</strong>`;
        html += '<table>';
        
        html += '<thead><tr><th>Base</th>';
        columns.forEach(column => { html += `<th>${column}</th>`; });
        html += '<th>b</th></tr></thead>';

        html += '<tbody>';
        tableau.forEach((row, i) => {
            const rowLabel = i < basis.length ? basis[i] : 'Objetivo';
            html += `<tr><th>${rowLabel}</th>`;
            row.forEach((cell, j) => {
                let cellContent = parseFloat(cell.toFixed(3));
                if (pivotInfo && i === pivotInfo.row && j === pivotInfo.col) {
                    html += `<td><span class="pivot-element">${cellContent}</span></td>`;
                } else {
                    html += `<td>${cellContent}</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        
        stepsOutput.innerHTML += html;
    }

    function printSolution(solution, diagnostics) {
        let html = `<p><strong>Solução Ótima Encontrada!</strong></p><ul>`;
        for (const [key, value] of Object.entries(solution.variables)) {
            if (key.startsWith('x')) {
                html += `<li><strong>${key}</strong> = ${value}</li>`;
            }
        }
        html += `</ul><p>${solution.objectiveText} de <strong>Z = ${solution.zValue}</strong></p>`;
        html += `<p class="diagnostics">${diagnostics.totalPivots} pivoteamento(s)`;
        if (diagnostics.normalizedRows > 0) {
            html += `; ${diagnostics.normalizedRows} restrição(ões) normalizada(s)`;
        }
        if (diagnostics.degeneratePivots > 0) {
            html += `; ${diagnostics.degeneratePivots} pivô(s) degenerado(s)`;
        }
        html += '.</p>';
        
        solutionOutput.className = 'result-card result-success';
        solutionOutput.innerHTML = html;
    }

    function statusLabel(status) {
        const labels = {
            infeasible: 'Problema inviável',
            unbounded: 'Problema ilimitado',
            iteration_limit: 'Limite de iterações atingido',
            numerical_failure: 'Falha numérica',
        };
        return labels[status] ?? 'Não foi possível concluir';
    }
    
    // Outras funções de UI
    function generateInputFields() {
        const numVars = parseInt(numVarsInput.value);
        const numConstraints = parseInt(numConstraintsInput.value);
        if (isNaN(numVars) || isNaN(numConstraints) || numVars < 1 || numConstraints < 1) { alert('Por favor, insira um número válido de variáveis e restrições.'); return; }
        objectiveFunctionDiv.innerHTML = '<span>Z =</span>';
        constraintsDiv.innerHTML = '';
        for (let i = 1; i <= numVars; i++) { objectiveFunctionDiv.innerHTML += `<input type="number" step="any" class="obj-coeff" placeholder="c${i}" required><span>x${i}</span>${i < numVars ? '<span>+</span>' : ''}`; }
        for (let i = 1; i <= numConstraints; i++) {
            let constraintHTML = '<div class="equation">';
            for (let j = 1; j <= numVars; j++) { constraintHTML += `<input type="number" step="any" class="constraint-coeff" data-row="${i - 1}" data-col="${j - 1}" placeholder="a${i}${j}" required><span>x${j}</span>${j < numVars ? '<span>+</span>' : ''}`; }
            constraintHTML += `
                <select class="constraint-relation" data-row="${i - 1}" aria-label="Relação da restrição ${i}">
                    <option value="&lt;=">≤</option>
                    <option value=">=">≥</option>
                    <option value="=">=</option>
                </select>
                <input type="number" step="any" class="rhs" data-row="${i - 1}" placeholder="b${i}" required>
            </div>`;
            constraintsDiv.innerHTML += constraintHTML;
        }
        simplexForm.classList.remove('hidden');
        randomFillBtn.classList.remove('hidden');
        resultsSection.classList.add('hidden');
    }

    function fillWithRandomData() {
        const allInputs = simplexForm.querySelectorAll('input[type="number"]');
        allInputs.forEach(input => {
            if (input.classList.contains('rhs')) { input.value = Math.floor(Math.random() * 91) + 10; } 
            else { input.value = Math.floor(Math.random() * 15) + 1; }
        });
    }

    function validateInputs() {
        const allInputs = simplexForm.querySelectorAll('input[type="number"]');
        let isValid = true;
        allInputs.forEach(input => input.classList.remove('invalid-input'));
        for (const input of allInputs) {
            const value = input.value.trim();
            if (value === '') { alert('Erro de validação: Por favor, preencha todos os campos.'); input.classList.add('invalid-input'); input.focus(); isValid = false; break; }
            if (isNaN(parseFloat(value))) { alert('Erro de validação: Por favor, insira apenas números.'); input.classList.add('invalid-input'); input.focus(); isValid = false; break; }
        }
        return isValid;
    }

    function parseInputs() {
        const C = Array.from(document.querySelectorAll('.obj-coeff')).map(input => parseFloat(input.value));
        const numConstraints = parseInt(numConstraintsInput.value);
        const A = [];
        for (let i = 0; i < numConstraints; i++) { A.push(Array.from(document.querySelectorAll(`.constraint-coeff[data-row="${i}"]`)).map(input => parseFloat(input.value))); }
        const b = Array.from(document.querySelectorAll('.rhs')).map(input => parseFloat(input.value));
        const relations = Array.from(document.querySelectorAll('.constraint-relation')).map(select => select.value);
        return { C, A, b, relations };
    }

    function handleReset() {
        simplexForm.classList.add('hidden');
        randomFillBtn.classList.add('hidden');
        resultsSection.classList.add('hidden');
        objectiveFunctionDiv.innerHTML = '<span>Z =</span>';
        constraintsDiv.innerHTML = '';
        numVarsInput.value = 2;
        numConstraintsInput.value = 2;
        simplexForm.querySelectorAll('.invalid-input').forEach(el => el.classList.remove('invalid-input'));
    }
});
