# Simulador do Método Simplex

Demonstração acadêmica, executada inteiramente no navegador, para acompanhar a resolução de problemas de programação linear pelo método Simplex de duas fases.

## Funcionalidades

- maximização e minimização;
- restrições dos tipos `≤`, `≥` e `=`;
- normalização automática de lados direitos negativos;
- Fase I com variáveis artificiais para encontrar uma base viável;
- Fase II com a função objetivo original;
- detecção de problemas inviáveis e ilimitados;
- regra de Bland para evitar ciclagem em bases degeneradas;
- exibição dos tableaus e pivôs do processo;
- validação final da solução contra as restrições originais.

Todas as variáveis de decisão são consideradas não negativas.

## Executar

Como a aplicação usa módulos JavaScript, sirva a pasta por HTTP. Uma opção com Node.js é:

```bash
npx serve .
```

Depois, abra o endereço informado pelo comando.

## Testes

```bash
npm test
```

A suíte cobre soluções conhecidas, restrições mistas, igualdade, lado direito negativo, inviabilidade, ilimitado, degenerescência, o exemplo clássico de ciclagem e uma comparação determinística com enumeração independente de vértices em problemas bidimensionais.

## Escopo e limitações

O projeto tem finalidade didática. Não implementa variáveis livres, limites personalizados por variável, Simplex dual, análise de sensibilidade nem otimizações específicas para matrizes grandes e esparsas.

Para decisões críticas ou modelos de grande porte, utilize um solver de otimização especializado e valide a formulação do problema.
