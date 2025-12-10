// simplex-solver.js
// Aqui fica toda a lógica pesada do Simplex, separada da interface.

/**
 * Funções auxiliares, privadas para este módulo.
 * Elas fazem o trabalho de encontrar pivôs e fazer os cálculos de linha.
 */

// Helper para encontrar a coluna pivô.
// Analisar a última linha (a linha Z) e encontrar a coluna com o menor valor.
// Variável que, quando aumentada, vai fornecer o maior ganho no resultado.
function findPivotColumn(lastRow, numTotalVars) {
    let minVal = 0;
    let pivotColIndex = -1;
    for (let j = 0; j < numTotalVars; j++) {
        if (lastRow[j] < minVal) {
            minVal = lastRow[j];
            pivotColIndex = j;
        }
    }
    return { pivotColIndex, pivotColValue: minVal };
}

// Helper para encontrar a linha pivô.
// Aqui está o "Teste da Razão".
// Dividir cada valor da coluna 'b' pelo seu correspondente na coluna pivô.
// A linha com a menor razão positiva é a que vai me limitar primeiro, então ela sai da base.
function findPivotRow(tableau, pivotColIndex) {
    let minRatio = Infinity;
    let pivotRowIndex = -1;
    let log = ""; // Montando um log para explicar os cálculos na tela depois.
    const numRows = tableau.length - 1;
    const rhsIndex = tableau[0].length - 1;

    for (let i = 0; i < numRows; i++) {
        const pivotColValue = tableau[i][pivotColIndex];
        const rhsValue = tableau[i][rhsIndex];
        log += `  - Linha ${i + 1}: `;
        
        // A razão só vale para valores positivos na coluna pivô.
        // Usar 1e-9 para evitar problemas com arredondamento de ponto flutuante.
        if (pivotColValue > 1e-9) {
            const ratio = rhsValue / pivotColValue;
            log += `Razão = ${rhsValue.toFixed(3)} / ${pivotColValue.toFixed(3)} = <strong>${ratio.toFixed(3)}</strong>\n`;
            if (ratio < minRatio) {
                minRatio = ratio;
                pivotRowIndex = i;
            }
        } else {
            log += `Valor na coluna pivô (${pivotColValue.toFixed(3)}) não é positivo. Razão ignorada.\n`;
        }
    }
    
    if (pivotRowIndex !== -1) {
        log += `\nA menor razão positiva é <strong>${minRatio.toFixed(3)}</strong>, na <strong>Linha ${pivotRowIndex + 1}</strong>. Esta é a nossa linha pivô.`;
    } else {
        log += `\nNenhuma razão positiva pôde ser calculada.`;
    }

    return { pivotRowIndex, log };
}

// A operação de pivoteamento.
// Transforma o elemento pivô em 1 e zera todo o resto da coluna dele.
function pivot(tableau, pivotRowIndex, pivotColIndex) {
    const pivotElement = tableau[pivotRowIndex][pivotColIndex];
    const pivotRow = tableau[pivotRowIndex];
    const numCols = pivotRow.length;
    let log = "";
    
    // 1. Normalizar a linha pivô: dividir a linha inteira pelo elemento pivô.
    log += `<strong>1. Normalizar a Linha Pivô (L${pivotRowIndex + 1}):</strong>\n`;
    log += `   Nova L${pivotRowIndex + 1} = Antiga L${pivotRowIndex + 1} / ${pivotElement.toFixed(3)}\n`;
    for (let j = 0; j < numCols; j++) {
        pivotRow[j] /= pivotElement;
    }

    // 2. Zerar o resto da coluna: para cada outra linha, subtraindo um múltiplo da
    //    linha pivô normalizada para zerar o elemento naquela coluna.
    log += `<strong>2. Zerar os outros elementos da Coluna Pivô:</strong>\n`;
    for (let i = 0; i < tableau.length; i++) {
        if (i !== pivotRowIndex) {
            const factor = tableau[i][pivotColIndex];
            log += `   Nova L${i + 1} = Antiga L${i + 1} - (${factor.toFixed(3)}) * (Nova L${pivotRowIndex + 1})\n`;
            for (let j = 0; j < numCols; j++) {
                tableau[i][j] -= factor * pivotRow[j];
            }
        }
    }
    return log;
}

/**
 * Função principal que o main.js vai chamar.
 * Ela recebe o problema e retorna um objeto com a solução e todos os passos.
 */
export function solve(C, A, b, objectiveType, numVars) {
    // Criar um array 'steps' para guardar cada etapa do processo. A UI vai usar isso.
    const steps = [];
    const numConstraints = A.length;
    const numSlack = numConstraints;
    const numTotalVars = numVars + numSlack;

    // 1. Montar a Tabela (Tableau) Inicial
    let tableau = [];
    for (let i = 0; i < numConstraints; i++) {
        // Adiciona as variáveis de folga para transformar as restrições em equações.
        const row = [...A[i], ...Array(numSlack).fill(0), b[i]];
        row[numVars + i] = 1; // O '1' na coluna da sua própria variável de folga.
        tableau.push(row);
    }

    // Monta a linha Z. Se for maximização, inverter os sinais.
    // Se for minimização, na verdade estou maximizando -Z, então os sinais ficam como estão.
    const zRowCoefficients = (objectiveType === 'maximize') ? C.map(val => -val) : C;
    const zRow = [...zRowCoefficients, ...Array(numSlack).fill(0), 0];
    tableau.push(zRow);

    // Salva o primeiro passo para a UI.
    if (objectiveType === 'minimize') {
        steps.push({ type: 'explanation', title: "Transformação do Problema", content: `Para resolver um problema de minimização, o transformamos em um problema de maximização equivalente: <strong>Maximizar P = -Z</strong>.<br>Por isso, os coeficientes da função objetivo entram na tabela com seus sinais originais.` });
    } else {
        steps.push({ type: 'explanation', title: "Passo 1: Montagem da Tabela Inicial", content: `Adicionamos as variáveis de folga (f1, f2, ...) para transformar as inequações em equações.\nA última linha representa a função objetivo Z com os coeficientes invertidos.` });
    }
    // Faz uma cópia da tabela para o log, para não ter problemas com referência.
    steps.push({ type: 'tableau', title: "Tabela Inicial (Iteração 0)", tableau: JSON.parse(JSON.stringify(tableau)), pivotInfo: null });

    // 2. O Loop Principal do Simplex
    let iteration = 1;
    while (iteration < 50) { // Um limite para não entrar em loop infinito
        const lastRow = tableau[tableau.length - 1];
        
        // Condição de parada: se não tem mais negativos na linha Z, achou a solução ótima.
        if (lastRow.slice(0, numTotalVars).every(val => val >= 0 || Math.abs(val) < 1e-9)) {
            steps.push({ type: 'explanation', title: "Condição de Parada", content: "Todos os coeficientes na linha Z são não-negativos. A solução ótima foi encontrada!" });
            
            // Ler a resposta da tabela final.
            const solution = {};
            const rhsIndex = tableau[0].length - 1;
            
            // Procurar as colunas "limpas" (um '1' e o resto '0') para achar as variáveis básicas.
            for (let j = 0; j < numTotalVars; j++) {
                let oneIndex = -1;
                let isBasic = true;
                for (let i = 0; i < tableau.length - 1; i++) {
                    if (Math.abs(tableau[i][j] - 1) < 1e-9 && oneIndex === -1) oneIndex = i;
                    else if (Math.abs(tableau[i][j]) > 1e-9) { isBasic = false; break; }
                }
                if (isBasic && oneIndex !== -1) {
                    const varName = j < numVars ? `x${j + 1}` : `f${j - numVars + 1}`;
                    solution[varName] = parseFloat(tableau[oneIndex][rhsIndex].toFixed(3));
                }
            }
            
            // Garante que todas as variáveis originais apareçam na solução, mesmo que sejam 0.
            for (let j=1; j <= numVars; j++) {
                if (!solution[`x${j}`]) solution[`x${j}`] = 0;
            }

            // Usa o valor de Z. Se era minimização, inverte o sinal no final.
            let zValue = tableau[tableau.length - 1][rhsIndex];
            if (objectiveType === 'minimize') zValue = -zValue;

            // Retorna um objeto com tudo o que a UI precisa.
            return {
                success: true,
                solution: {
                    variables: solution,
                    zValue: parseFloat(zValue.toFixed(3)),
                    objectiveText: (objectiveType === 'maximize') ? "Valor máximo" : "Valor mínimo",
                },
                steps
            };
        }

        // Se não for a solução ótima, continua o processo...
        const { pivotColIndex, pivotColValue } = findPivotColumn(lastRow, numTotalVars);
        const varEntra = pivotColIndex < numVars ? `x${pivotColIndex + 1}` : `f${pivotColIndex - numVars + 1}`;
        steps.push({ type: 'explanation', title: `Iteração ${iteration} - Passo 2: Encontrar Coluna Pivô`, content: `Procuramos o valor mais negativo na linha Z. O valor é <strong>${pivotColValue.toFixed(3)}</strong> na coluna <strong>${varEntra}</strong>.\nEsta será nossa coluna pivô.` });

        const { pivotRowIndex, log } = findPivotRow(tableau, pivotColIndex);
        steps.push({ type: 'explanation', title: `Iteração ${iteration} - Passo 3: Encontrar Linha Pivô (Teste da Razão)`, content: `Dividimos cada valor da coluna 'b' pelo seu correspondente na coluna pivô (apenas para valores > 0).\n${log}` });

        // Se não encontrou linha pivô, o problema é ilimitado.
        if (pivotRowIndex === -1) {
            return { success: false, message: "Problema Ilimitado (Unbounded). Não foi possível encontrar uma linha pivô válida.", steps };
        }
        
        // Salva os passos antes e depois do pivoteamento.
        const pivotElement = tableau[pivotRowIndex][pivotColIndex];
        steps.push({ type: 'explanation', title: `Iteração ${iteration} - Passo 4: Identificar Elemento Pivô`, content: `O elemento pivô é o valor na interseção da linha e coluna pivô: <strong>${pivotElement.toFixed(3)}</strong>.` });
        steps.push({ type: 'tableau', title: `Tabela Antes do Pivoteamento`, tableau: JSON.parse(JSON.stringify(tableau)), pivotInfo: { row: pivotRowIndex, col: pivotColIndex } });

        const pivotLog = pivot(tableau, pivotRowIndex, pivotColIndex);
        steps.push({ type: 'explanation', title: `Iteração ${iteration} - Passo 5: Pivoteamento`, content: `Usamos operações de linha para transformar o elemento pivô em 1 e zerar os outros elementos da coluna pivô.\n${pivotLog}` });
        steps.push({ type: 'tableau', title: `Tabela Após Pivoteamento (Fim da Iteração ${iteration})`, tableau: JSON.parse(JSON.stringify(tableau)), pivotInfo: null });
        
        iteration++;
    }

    // Se o loop terminar por causa do limite de iterações.
    return { success: false, message: "Limite de iterações atingido.", steps };
}