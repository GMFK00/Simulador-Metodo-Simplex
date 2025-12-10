
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
            const { C, A, b } = parseInputs();
            const result = solve(C, A, b, objectiveType, numVars);

            // Limpa saídas anteriores
            stepsOutput.innerHTML = '';
            solutionOutput.innerHTML = '';

            // Renderização dos passos
            result.steps.forEach(step => {
                if (step.type === 'explanation') {
                    printExplanation(step.title, step.content);
                } else if (step.type === 'tableau') {
                    printTableau(step.tableau, step.title, step.pivotInfo);
                }
            });

            // Renderização da solução final ou a mensagem de erro
            if (result.success) {
                printSolution(result.solution);
            } else {
                solutionOutput.innerHTML = `<p><strong>${result.message}</strong></p>`;
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

    function printTableau(tableau, title, pivotInfo = null) {
        let html = `<strong>${title}:</strong>`;
        html += '<table>';
        
        html += '<thead><tr>';
        const numVars = parseInt(numVarsInput.value);
        const numSlacks = parseInt(numConstraintsInput.value);
        for(let i = 1; i <= numVars; i++) html += `<th>x${i}</th>`;
        for(let i = 1; i <= numSlacks; i++) html += `<th>f${i}</th>`;
        html += '<th>b</th></tr></thead>';

        html += '<tbody>';
        tableau.forEach((row, i) => {
            html += '<tr>';
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

    function printSolution(solution) {
        let html = `<p><strong>Solução Ótima Encontrada!</strong></p><ul>`;
        for (const [key, value] of Object.entries(solution.variables)) {
            if (key.startsWith('x')) {
                html += `<li><strong>${key}</strong> = ${value}</li>`;
            }
        }
        html += `</ul><p>${solution.objectiveText} de <strong>Z = ${solution.zValue}</strong></p>`;
        
        solutionOutput.innerHTML = html;
    }
    
    // Outras funções de UI
    function generateInputFields() {
        const numVars = parseInt(numVarsInput.value);
        const numConstraints = parseInt(numConstraintsInput.value);
        if (isNaN(numVars) || isNaN(numConstraints) || numVars < 1 || numConstraints < 1) { alert('Por favor, insira um número válido de variáveis e restrições.'); return; }
        objectiveFunctionDiv.innerHTML = '<span>Z =</span>';
        constraintsDiv.innerHTML = '';
        for (let i = 1; i <= numVars; i++) { objectiveFunctionDiv.innerHTML += `<input type="number" class="obj-coeff" placeholder="c${i}" required><span>x${i}</span>${i < numVars ? '<span>+</span>' : ''}`; }
        for (let i = 1; i <= numConstraints; i++) {
            let constraintHTML = '<div class="equation">';
            for (let j = 1; j <= numVars; j++) { constraintHTML += `<input type="number" class="constraint-coeff" data-row="${i - 1}" data-col="${j - 1}" placeholder="a${i}${j}" required><span>x${j}</span>${j < numVars ? '<span>+</span>' : ''}`; }
            constraintHTML += `<span>&le;</span><input type="number" class="rhs" data-row="${i - 1}" placeholder="b${i}" required></div>`;
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
            if (input.classList.contains('rhs') && parseFloat(value) < 0) { alert('Erro de validação: Os valores do lado direito (b) devem ser não-negativos.'); input.classList.add('invalid-input'); input.focus(); isValid = false; break; }
        }
        return isValid;
    }

    function parseInputs() {
        const C = Array.from(document.querySelectorAll('.obj-coeff')).map(input => parseFloat(input.value));
        const numConstraints = parseInt(numConstraintsInput.value);
        const A = [];
        for (let i = 0; i < numConstraints; i++) { A.push(Array.from(document.querySelectorAll(`.constraint-coeff[data-row="${i}"]`)).map(input => parseFloat(input.value))); }
        const b = Array.from(document.querySelectorAll('.rhs')).map(input => parseFloat(input.value));
        return { C, A, b };
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