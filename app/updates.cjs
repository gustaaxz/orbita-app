'use strict';

function createUpdates(onState) {
  const { autoUpdater } = require('electron-updater');
  let state = { status: 'idle' };
  let checking = false;
  let downloading = false;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  const publish = (status, details = {}) => {
    state = { status, ...details };
    onState(state);
  };

  autoUpdater.on('error', error => {
    console.error('Falha na atualização:', error.message);
    publish('error', { message: 'Não foi possível atualizar. Confira a conexão e tente novamente.' });
  });
  autoUpdater.on('update-available', info => publish('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => publish('current'));
  autoUpdater.on('download-progress', ({ percent }) => {
    const progress = Math.round(percent);
    if (progress !== state.progress) publish('downloading', { version: state.version, progress });
  });
  autoUpdater.on('update-downloaded', info => publish('ready', { version: info.version }));

  return {
    state: () => state,
    async check() {
      if (checking || downloading || state.status === 'ready') return;
      checking = true;
      publish('checking');
      try {
        await autoUpdater.checkForUpdates();
      } catch {
        // The updater emits the error separately.
      } finally {
        checking = false;
      }
    },
    async download() {
      if (state.status !== 'available' || downloading) return;
      downloading = true;
      publish('downloading', { version: state.version, progress: 0 });
      try {
        await autoUpdater.downloadUpdate();
      } catch {
        // The updater emits the error separately.
      } finally {
        downloading = false;
      }
    },
    install() {
      if (state.status === 'ready') autoUpdater.quitAndInstall(false, true);
    }
  };
}

module.exports = { createUpdates };
