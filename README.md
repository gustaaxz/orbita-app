# Órbita — Organizador pessoal para Windows

Aplicativo pessoal em português, com funcionamento offline e dados locais.

## Usar

Execute `Orbita-Instalar-1.0.0.exe`, escolha a pasta e conclua a instalação. O instalador cria atalhos na área de trabalho e no menu Iniciar. Não é necessário instalar Node.js, Python ou outros componentes para usar o aplicativo.

Em **Configurações → Iniciar com o Windows**, ative a opção para o aplicativo iniciar na bandeja ao entrar no Windows. A opção fica desativada por padrão. Se o Windows desativar o item na lista de aplicativos de inicialização, também será necessário reativá-lo nessa lista.

## Funcionalidades

- **Meu dia:** tarefas com prazo até hoje, compromissos, hábitos e minutos de foco.
- **Tarefas:** criar, editar, concluir, reabrir e excluir; definir prazo, horário, prioridade, projeto e lembrete; buscar e filtrar.
- **Calendário:** visão mensal e agenda do dia, com tarefas e compromissos. Compromissos sem horário são de dia inteiro; os demais têm início e término opcional no mesmo dia.
- **Projetos:** tarefas vinculadas e progresso calculado pelas tarefas concluídas. Excluir um projeto mantém suas tarefas.
- **Metas:** objetivo numérico, unidade, prazo e atualização manual do progresso.
- **Hábitos:** hábitos diários, marcação por dia, histórico semanal e sequência de dias consecutivos. É possível registrar dias anteriores.
- **Finanças:** receitas e despesas manuais em reais, categorias, saldo mensal e distribuição das despesas. Não há conexão com bancos ou execução de pagamentos.
- **Notas:** texto simples, cores e busca.
- **Foco:** duração de 1 a 240 minutos, pausa, continuação e histórico de sessões completas. O tempo decorrido é contado mesmo se o computador suspender ou o aplicativo sair; ao reabrir, uma sessão vencida é registrada uma única vez. Sessões encerradas manualmente não entram no histórico.
- **Preferências:** nome, tema claro/escuro, lembretes, bandeja e início com o Windows.
- **Backup:** exportação e restauração de todos os módulos em JSON. Restaurar interrompe o timer e preserva uma cópia dos dados anteriores.

## Lembretes e segundo plano

Marque a opção de lembrete ao criar ou editar uma tarefa ou compromisso e informe data e horário. O aviso é enviado no horário escolhido, uma vez por registro. Alterar data, horário ou reativar o lembrete permite um novo aviso.

O aplicativo precisa estar aberto para emitir avisos. Por padrão, clicar no X oculta a janela na bandeja, perto do relógio, mantendo os lembretes ativos. Clique no ícone para abrir; clique com o botão direito para sair. O Windows pode agrupar, adiar ou silenciar os avisos conforme suas configurações.

Ao reabrir o aplicativo, lembretes pendentes das últimas 24 horas são enviados. Lembretes mais antigos não são enviados para evitar avisos fora de contexto. Não há envio por e-mail, celular ou sincronização com calendários externos nesta versão.

## Dados e recuperação

Os dados ficam em `%APPDATA%\Orbita\dados.json`. A gravação usa arquivo temporário e troca do arquivo final. `dados.json.bak` guarda a versão anterior. Se o arquivo principal estiver danificado, o aplicativo tenta a cópia anterior e preserva o arquivo com problema. Se ambos estiverem ilegíveis, o aplicativo não sobrescreve os arquivos e mostra a localização para recuperação.

Use **Configurações → Exportar backup** regularmente e guarde o arquivo fora desta pasta. Os arquivos locais e backups não são criptografados nem protegidos por senha. Desinstalar o aplicativo preserva os dados pessoais. A restauração é validada antes de substituir os dados atuais.

## Atalhos

- `Ctrl + N`: nova tarefa.
- `Ctrl + F`: buscar na tela atual, quando a busca estiver disponível.
- `Esc`: fechar um formulário sem salvar.
- Clique no título de um registro para editar ou excluir.

## Desenvolvimento

Requer Node.js 22 ou superior e Windows 10/11 de 64 bits. Interface em HTML/CSS/JavaScript e aplicativo desktop com Electron. Não há dependências de produção externas ao Electron.

```text
npm ci
npm start
npm test
npm run test:app
npm run build
```

Os testes usam dados isolados em `tests/scratch` e `tests/artifacts`. `ORBITA_DATA_DIR` permite um diretório de dados separado para desenvolvimento; `ORBITA_TEST=1` desativa bandeja, notificações reais e alteração da inicialização durante testes.

O instalador é local e não possui assinatura digital de publicador. Atualizações nesta versão são manuais: instalar uma nova versão sobre a anterior preserva os dados. Não há serviço remoto, telemetria ou conta online.

Documentação técnica consultada: [Electron — segurança](https://www.electronjs.org/docs/latest/tutorial/security), [Electron — inicialização com o sistema](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows) e [electron-builder — instalador NSIS](https://www.electron.build/docs/nsis/).
