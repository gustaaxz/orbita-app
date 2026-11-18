# Órbita — Organizador pessoal para Windows

Aplicativo pessoal em português, com funcionamento offline e dados locais.

## Usar

Baixe o instalador em [Releases](https://github.com/gustaaxz/orbita-app/releases/latest), execute o arquivo `.exe` e conclua a instalação. O instalador cria atalhos na área de trabalho e no menu Iniciar. Não é necessário instalar Node.js, Python ou outros componentes para usar o aplicativo.

Em **Configurações → Iniciar com o Windows**, ative a opção para o aplicativo iniciar na bandeja ao entrar no Windows. A opção fica desativada por padrão. Se o Windows desativar o item na lista de aplicativos de inicialização, também será necessário reativá-lo nessa lista.

## Funcionalidades

- **Meu dia:** tarefas com prazo até hoje, compromissos, hábitos e minutos de foco. Use a bandeira para escolher até três tarefas prioritárias por dia.
- **Tarefas:** prazo de entrega, data e horário planejados, duração, projeto, lembretes e subtarefas. Ao concluir uma tarefa recorrente, o Órbita cria a próxima ocorrência com a lista de subtarefas desmarcada. As opções são diária, dias úteis, semanal e mensal.
- **Revisão semanal:** caixa de entrada para tarefas sem data, prazos atrasados, próximos compromissos, minutos planejados e até três prioridades por dia. Use **Planejar** para reservar um dia e horário para uma tarefa.
- **Calendário:** visões mensal e semanal com tarefas e compromissos. Na semana, arraste uma tarefa para mudar a data planejada. O prazo de entrega continua no dia original.
- **Projetos:** quadro com as colunas A fazer, Em andamento e Concluído. A visão de projetos reúne progresso, notas, metas e minutos de foco.
- **Metas:** objetivo numérico, unidade, prazo e atualização manual do progresso.
- **Hábitos:** prática diária, em dias escolhidos ou com uma meta semanal. Consulte e marque registros no histórico semanal ou mensal.
- **Finanças:** receitas e despesas em reais, lançamentos mensais, parcelas, importação de CSV e limites mensais por categoria. Informe o valor total ao parcelar. Em **Previsão**, veja de 3 a 12 meses de despesas, com parcelas já cadastradas e recorrências projetadas em valores separados.
- **Notas:** texto simples, cores e busca.
- **Foco:** duração de 1 a 240 minutos, pausa, continuação e histórico de sessões completas. Na edição de uma tarefa, use **Foco** para começar e registrar o tempo no projeto associado. Ao reabrir o aplicativo, uma sessão vencida é registrada uma única vez.
- **Preferências:** nome, tema claro/escuro, lembretes, bandeja e início com o Windows.
- **Backup e lixeira:** até 14 cópias diárias no computador, exportação manual, prévia da restauração e recuperação de itens excluídos. Restaurar um backup interrompe o timer e guarda uma cópia dos dados anteriores.

Para importar finanças, use um CSV em UTF-8, por exemplo:

```csv
descrição;data;tipo;valor;categoria
Mercado;18/11/2026;Despesa;45,90;Alimentação
```

O Órbita valida o arquivo antes de importar e pede confirmação com a quantidade de registros. Cada importação adiciona lançamentos à lista atual.

## Lembretes e segundo plano

Marque a opção de lembrete ao criar ou editar uma tarefa ou compromisso. Para tarefas, informe a data e o horário planejados. Escolha avisar no horário, 10 minutos, uma hora ou um dia antes. Quando disponíveis no Windows, os botões da notificação permitem adiar por 10 minutos, concluir a tarefa ou abrir o compromisso.

O aplicativo precisa estar aberto para emitir avisos. Por padrão, clicar no X oculta a janela na bandeja, perto do relógio, mantendo os lembretes ativos. Clique no ícone para abrir; clique com o botão direito para sair. O Windows pode agrupar, adiar ou silenciar os avisos conforme suas configurações.

Ao reabrir o aplicativo, lembretes pendentes das últimas 24 horas são enviados. Lembretes mais antigos não são enviados para evitar avisos fora de contexto. Não há envio por e-mail, celular ou sincronização com calendários externos nesta versão.

## Dados e recuperação

Os dados ficam em `%APPDATA%\Orbita\dados.json`. A gravação usa arquivo temporário e troca do arquivo final. `dados.json.bak` guarda a versão anterior. Se o arquivo principal estiver danificado, o aplicativo tenta a cópia anterior e preserva o arquivo com problema. Se ambos estiverem ilegíveis, o aplicativo não sobrescreve os arquivos e mostra a localização para recuperação.

Use **Configurações → Exportar backup** regularmente e guarde o arquivo fora desta pasta. Os arquivos locais e backups não são criptografados nem protegidos por senha. Desinstalar o aplicativo preserva os dados pessoais. A restauração é validada antes de substituir os dados atuais.

Em **Configurações → Pasta de backup adicional**, escolha uma pasta em outro disco ou uma pasta que você já sincroniza pelo Windows. O Órbita mantém as cópias locais e até 14 cópias na pasta adicional. Se o disco estiver desconectado, a cópia local continua disponível. Reconecte o disco e use **Verificar cópia de hoje** para tentar novamente. O histórico permite restaurar de qualquer uma das duas pastas.

## Atalhos

- `Ctrl + N`: nova tarefa.
- `Ctrl + F`: buscar na tela atual, quando a busca estiver disponível.
- `Ctrl + K`: buscar em todo o Órbita, inclusive sem acentos.
- `Ctrl + Shift + Espaço`: capturar uma tarefa mesmo com outra janela em foco, enquanto o Órbita estiver aberto. Também há a opção **Capturar** na barra superior e no menu da bandeja.
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

Na versão 1.0, instale manualmente o novo `.exe` sobre a versão anterior. A partir da 1.1, **Configurações → Atualizações** verifica, baixa e instala novas versões publicadas. O aplicativo pede confirmação antes de reiniciar. A consulta ao abrir pode ser desativada.

O instalador atual não tem assinatura digital de publicador. O aplicativo usa os metadados da Release para verificar a integridade do download. Os dados pessoais ficam no computador e o aplicativo funciona offline. A consulta e o download de atualizações precisam de internet.

O GitHub Actions executa os testes no Windows. Para tags de versão e execuções manuais, ele gera um artefato com o instalador, o `.blockmap` e o `latest.yml`. Publique os três arquivos juntos em cada Release.

Documentação técnica consultada: [Electron — segurança](https://www.electronjs.org/docs/latest/tutorial/security), [Electron — inicialização com o sistema](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows) e [electron-builder — instalador NSIS](https://www.electron.build/docs/nsis/).
