'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { today } = require('./core.cjs');

const backupName = /^backup-\d{4}-\d{2}-\d{2}\.json$/;

class BackupLocation {
  constructor(store) {
    this.store = store;
    this.configPath = path.join(store.dir, 'preferencias-da-maquina.json');
    this.parent = '';
    this.id = randomUUID();
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      if (typeof config.parent === 'string' && path.isAbsolute(config.parent)
        && /^[0-9a-f-]{36}$/.test(config.id)) {
        this.parent = config.parent;
        this.id = config.id;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Falha nas preferências da máquina:', error.message);
    }
  }

  directory(parent = this.parent) {
    return parent ? path.join(parent, 'Órbita Backups', this.id) : '';
  }

  choose(parent) {
    if (parent) {
      if (!fs.statSync(parent).isDirectory()) throw new Error('Escolha uma pasta de backup.');
      const directory = this.directory(parent);
      fs.mkdirSync(directory, { recursive: true });
      if (this.store.data.settings.automaticBackups) this.write(directory);
    }
    const temp = this.configPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ parent, id: this.id }), 'utf8');
    fs.renameSync(temp, this.configPath);
    this.parent = parent;
  }

  daily(day = today()) {
    if (!this.parent || !this.store.data.settings.automaticBackups) return;
    if (!fs.existsSync(this.parent)) throw new Error('A pasta de backup está indisponível.');
    const directory = this.directory();
    fs.mkdirSync(directory, { recursive: true });
    this.write(directory, day);
  }

  write(directory, day = today()) {
    const file = path.join(directory, `backup-${day}.json`);
    if (fs.existsSync(file)) return;
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.store.data, null, 2), 'utf8');
    fs.renameSync(temp, file);
    for (const name of this.list(directory).slice(14)) fs.unlinkSync(path.join(directory, name));
  }

  list(directory = this.directory()) {
    if (!directory || !fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && backupName.test(entry.name))
      .map(entry => entry.name).sort().reverse();
  }

  file(name) {
    if (!this.list().includes(name)) throw new Error('Backup externo não encontrado.');
    return path.join(this.directory(), name);
  }
}

module.exports = { BackupLocation };
