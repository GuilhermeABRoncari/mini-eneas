# Performance — 0.1.0 → 0.1.1

Medição em 28/10/2026. Desenvolvimento e testes exclusivamente headless, sem iniciar janelas do Electron.

| Métrica | Antes | Depois |
|---|---:|---:|
| Triângulos por quadro | 46.780 | 14.660 |
| Chamadas de desenho por quadro | 53 | 25 |
| GLB com cinco animações | 1.189.200 bytes | 424.552 bytes |
| Resolução máxima interna | 1,7× | 1× |
| Quadros-alvo por segundo: reação / repouso / sono | 30 / 30 / 10 | 30 / 12 / 4 |

## Tempo mediano de desenho em software

| Densidade da tela | Estado | Antes | Depois |
|---|---|---:|---:|
| 1× | idle | 15.7 ms | 5.6 ms |
| 1× | wave | 14.8 ms | 5.5 ms |
| 1× | annoyed | 13.9 ms | 5.7 ms |
| 2× | idle | 20.6 ms | 5.4 ms |
| 2× | wave | 21.3 ms | 5.2 ms |
| 2× | annoyed | 19.5 ms | 5.1 ms |

## Método e limites

Chromium headless + SwiftShader; 10 aquecimentos e 40 amostras por estado; readPixels síncrono de 1 pixel central; mesma janela 420x650. Browser 156.0.8078.73.

Antes: bundle preservado da versão anterior. Depois: compilação otimizada. Mesmos estados, aquecimento, número de amostras e tamanho CSS. Execuções sequenciais para evitar competição entre os testes. A leitura síncrona de um pixel central força a conclusão do desenho antes de medir o tempo; este custo também faz parte da amostra.

Em densidade 1×, os buffers têm o mesmo tamanho. Em densidade 2×, a versão nova desenha menos pixels por limitar a resolução interna a 1×; o ganho inclui essa troca de nitidez por custo. Não interpretar o tempo como FPS total, redução de RAM do Electron ou garantia de ganho idêntico na GPU/compositor do usuário. Não foi medido consumo energético.

A validação visual observou 15 frames de repouso e 5 de sono em intervalos de 1,2 segundo, incluindo o frame solicitado ao clicar. Não há polling contínuo por requestAnimationFrame quando oculto; os testes com relógio simulado verificam cancelamento, prazo e retorno após pausa.

Os nove testes de estados/modelo/agendamento, TypeScript, compilação e integração visual passaram. O GLB foi reimportado e mantém os cinco clipes. Olhos, boca, sobrancelhas e articulações continuam separados.

Dados brutos: [antes](previews/performance-before.json) e [depois](previews/performance-after.json).

## Alterações

- Menos subdivisões em formas pequenas; cabeça mantém maior resolução.
- Agrupamento por material dentro da mesma articulação, com vértices reindexados.
- Materiais de iluminação mais simples para exibição, sem modificar os materiais PBR da exportação.
- Buffer não preservado entre quadros e limite de resolução interna.
- Agendamento por estado e pausa real quando oculto, com interação solicitando frame imediato.
- Animações avançam pelo tempo decorrido, sem o corte de 100 ms que retardava os clipes sob carga.

Referências: [MeshLambertMaterial](https://threejs.org/docs/pages/MeshLambertMaterial.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
