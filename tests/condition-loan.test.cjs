const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');

function section(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `No se encontró ${start}`);
    return source.slice(from, to);
}
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-19T12:00:00'])); }
}
function context(extra = {}) {
    const ctx = vm.createContext({ Date: FixedDate, console, ...extra });
    vm.runInContext(section('const MESES = ', 'function getEstadoItem(item)'), ctx);
    vm.runInContext(section('function getMonthIndex(dateStr)', 'function itemMatchesDateRange'), ctx);
    return ctx;
}

test('condición de administrador y KPI por fecha', () => {
    const data = [
        {N:'1', CONDICION:'Usado', 'F. VENC.':'12/2026'},
        {N:'227', CONDICION:'Despresurizado', 'F. VENC.':'09/27'},
        {N:'3', CONDICION:'Dañado', 'F. VENC.':'10/2026'},
        {N:'4', CONDICION:'Vigente', 'F. VENC.':'10/2026', proxima_recarga:'01/2027'},
        {N:'5', CONDICION:'', 'F. VENC.':'10/2026'},
        {N:'6', CONDICION:'Baja', 'F. VENC.':'12/2026'}
    ];
    const elements = Object.fromEntries(['area-filter','numero-filter','serie-filter','tipo-filter','capacidad-filter','condicion-filter','kpi-total','kpi-vigentes','kpi-por-vencer','kpi-vencidos'].map(k => [k,{value:'', textContent:''}]));
    let rendered = [];
    const ctx = context({isAdmin:true, misDatos:data, currentTab:'todos', currentSubTab:'stock', globalCondicionFilter:'', calPendingDesde:'', calPendingHasta:'', document:{getElementById:id=>elements[id]}, renderTable:items=>{rendered=items;}, updateCounter(){}, actualizarAlertaGarantias(){}, compararNumeros:(a,b)=>Number(a.N)-Number(b.N), itemMatchesDateRange:()=>true});
    vm.runInContext(section('function actualizarTarjetasResumen()', 'function renderTable(data)'), ctx);
    assert.equal(ctx.getCondicionItem(data[0]), 'Usado');
    assert.equal(ctx.getCondicionItem(data[1]), 'Despresurizado');
    assert.equal(ctx.getCondicionItem(data[2]), 'Dañado');
    assert.equal(ctx.getCondicionItem(data[4]), 'Vencido');
    assert.equal(ctx.getCondicionItem(data[5]), 'Baja');
    assert.equal(ctx.getCondicionItem({CONDICION:'-', 'F. VENC.':'12/2026'}), 'Vigente');
    assert.equal(ctx.getCondicionItem({CONDICION:'No ubicado', 'F. VENC.':'10/2026'}), 'Vencido');
    assert.equal(ctx.getCondicionItem({CONDICION:'Vigente', 'F. VENC.':'10/2026'}), 'Vencido');
    assert.equal(ctx.isItemExpired(data[0]), false);
    assert.equal(ctx.getEstadoVencimiento(data[3]), 'Vigente');
    ctx.applyFilters();
    assert.equal(elements['kpi-total'].textContent, 5);
    assert.equal(elements['kpi-vigentes'].textContent, 3);
    assert.equal(elements['kpi-vencidos'].textContent, 2);
    ctx.globalCondicionFilter = 'Vencido'; ctx.applyFilters();
    assert.deepEqual(Array.from(rendered, x=>x.N), ['3','5']);
    ctx.globalCondicionFilter = 'Vigente'; ctx.applyFilters();
    assert.deepEqual(Array.from(rendered, x=>x.N), ['1','4','227']);
    ctx.globalCondicionFilter = ''; ctx.isAdmin = false;
    assert.equal(ctx.getCondicionItem(data[0]), 'Vencido');
    assert.equal(ctx.getCondicionItem(data[1]), 'Vencido');
    assert.equal(ctx.getCondicionItem({CONDICION:'Dañado', 'F. VENC.':'12/2026'}), 'Vencido');
    assert.equal(ctx.getCondicionItem({CONDICION:'No ubicado', 'F. VENC.':'12/2026'}), 'Vigente');
    elements['condicion-filter'].value = 'Vencido'; ctx.applyFilters();
    assert.deepEqual(Array.from(rendered, x=>x.N), ['1','3','5','227']);
    elements['condicion-filter'].value = 'Vigente'; ctx.applyFilters();
    assert.deepEqual(Array.from(rendered, x=>x.N), ['4']);
    assert.equal(ctx.escapeCondicion('<img src=x>'), '&lt;img src=x&gt;');
});

async function finish({selected = 0, ambiguous = false, single = false, unit = false, fail = false} = {}) {
    const original = {N:'1', CONDICION:'Usado', ESTADO:ambiguous ? null : 'Almacén SST', 'F. VENC.':'06/2025', proxima_recarga:'12/2026'};
    const replacement = {N:'2', CONDICION:'Vigente', ESTADO:'Prestado', 'F. VENC.':'03/2028'};
    const data = [original, replacement];
    const loans = unit ? {'1':{tipo:'prestamo_unidad'}} : {
        '1':{tipo:'prestamo_interno', reemplazo:single ? null : '2', ubicacion_destino:ambiguous ? '' : 'Mantenimiento / Almacén SST'},
        '2':{tipo:'prestamo_interno', reemplazo:'1', ubicacion_destino:'Préstamo a: otra área'}
    };
    const writes = [], messages = [], prompts = [];
    const db = {from(table) {return {update(patch) {const filters=[]; const chain={eq(k,v){filters.push([k,v]);return chain;},in(){return chain;},then(resolve){writes.push({table,patch,filters}); if (fail) return resolve({error:{message:'error simulado'}}); if(table==='ext'){const number=filters.find(([k])=>k==='N')[1];Object.assign(data.find(x=>x.N===number),patch);}resolve({error:null});}};return chain;}};}};
    const ctx = context({isAdmin:true, misDatos:data, movimientosPrestamoActivos:loans, movimientosActivos:{}, historialCompleto:[], supabaseClient:db, TABLA_MOVIMIENTOS:'mov', TABLA_EXTINTORES:'ext', showPromptModal:async(...args)=>{prompts.push(args);return '12/2026';}, showGenericModal:async(...args)=>{messages.push(args);}, actualizarUnExtintor:async()=>{}, closeModal(){}, applyFilters(){}});
    vm.runInContext(section('async function finalizarPrestamo(itemIndex)', 'const nombresMostrar ='), ctx);
    await ctx.finalizarPrestamo(selected);
    return {original,replacement,writes,messages,prompts};
}
for (const selected of [0,1]) test(`cierre desde ${selected ? 'reemplazo' : 'original'} guarda la fecha solo en el original`, async () => {
    const {original,replacement,prompts} = await finish({selected});
    assert.equal(original['F. VENC.'], '12/2026');
    assert.equal(original.proxima_recarga, null);
    assert.equal(original.CONDICION, 'Usado');
    assert.equal(replacement['F. VENC.'], '03/2028');
    assert.match(prompts[0][0], /N° 1/);
    assert.equal(prompts[0][2], '06/2025');
});
test('traslado sin reemplazo actualiza el extintor original', async () => {
    const {original} = await finish({single:true});
    assert.equal(original['F. VENC.'], '12/2026');
});
test('préstamo a unidad no pide ni modifica la fecha', async () => {
    const {original,prompts} = await finish({unit:true});
    assert.equal(prompts.length, 0);
    assert.equal(original['F. VENC.'], '06/2025');
});
test('asociación ambigua no modifica registros', async () => {
    const {writes,messages} = await finish({ambiguous:true,selected:1});
    assert.equal(writes.length, 0);
    assert.match(messages[0][0], /No se pudo identificar/);
});
test('error de base de datos no se presenta como éxito', async () => {
    const {messages} = await finish({fail:true});
    assert.equal(messages.at(-1)[1], 'Error');
});
