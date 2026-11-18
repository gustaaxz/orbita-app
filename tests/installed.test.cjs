'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const exe=process.argv[2];if(!exe)throw new Error('Informe o executável instalado.');
fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
const dataDir=fs.mkdtempSync(path.join(__dirname,'artifacts','installed-'));
const env={...process.env,ORBITA_DATA_DIR:dataDir,ORBITA_TEST:'0'};delete env.ELECTRON_RUN_AS_NODE;
let app,page,initialStartup=false;
(async()=>{
  try{
    app=await electron.launch({executablePath:exe,args:[],env});page=await app.firstWindow();await page.waitForSelector('#content');
    let data=await page.evaluate(()=>window.orbita.read());assert.equal(data.runtime.packaged,true);assert.equal(data.tasks.length,0);initialStartup=data.runtime.startup;
    await page.getByRole('button',{name:'Configurações',exact:true}).click();
    const startup=page.getByRole('switch',{name:'Iniciar com o Windows',exact:true});assert.equal(await startup.isEnabled(),true);
    if(!initialStartup)await startup.click();
    await page.waitForFunction(async()=> (await window.orbita.read()).runtime.startup===true);
    const registry=require('node:child_process').execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','/v','Orbita'],{encoding:'utf8'});
    assert.ok(registry.includes('--background'));
    let login=await app.evaluate(({app})=>app.getLoginItemSettings({path:app.getPath('exe')}));
    assert.equal(login.executableWillLaunchAtLogin,true);assert.ok(login.launchItems.some(x=>x.name==='Orbita'&&x.enabled));
    await page.waitForTimeout(200);
    assert.equal((await page.evaluate(()=>window.orbita.read())).runtime.startup,true);
    await startup.click();await page.waitForFunction(async()=> (await window.orbita.read()).runtime.startup===false);
    // Closing hides the real installed window while the tray keeps the process alive.
    const visible=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.close();return w.isVisible();});assert.equal(visible,false);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
    await page.getByRole('button',{name:'Meu dia',exact:true}).click();
    await page.screenshot({path:path.join(__dirname,'artifacts','installed.png')});
    // Simulate Windows launching the registered command: a hidden main window with tray.
    await app.close();app=null;
    app=await electron.launch({executablePath:exe,args:['--background'],env});page=await app.firstWindow();await page.waitForSelector('#content');
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
    console.log('PASS: installed app, startup registration on/off, tray close and background launch');
    fs.writeFileSync(path.join(__dirname,'artifacts','installed-result.json'),JSON.stringify({passed:true,executable:exe,startupRestored:initialStartup},null,2));
  }catch(error){console.error(error);process.exitCode=1;}
  finally{
    if(app){try{await page.evaluate(enabled=>window.orbita.startup(enabled),initialStartup);}catch{}await app.close().catch(()=>{});}
  }
})();
