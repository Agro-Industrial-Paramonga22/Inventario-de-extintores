// ============================================================
//  FILTROS COLAPSABLES EN MÓVIL
// ============================================================
(function initMobileFilters() {
    const filtersContainer = document.querySelector('.filters-container');
    const toggle = document.getElementById('filtersToggle');
    if (!filtersContainer || !toggle) return;

    const isMobile = () => window.innerWidth <= 640;

    function syncOnResize() {
        if (isMobile()) {
            // En móvil: colapsamos por defecto al cargar (si no se ha tocado el botón)
            if (!filtersContainer.dataset.userToggled) {
                filtersContainer.classList.add('collapsed');
            }
        } else {
            // En escritorio: siempre visible y reseteamos la preferencia
            filtersContainer.classList.remove('collapsed');
            delete filtersContainer.dataset.userToggled;
        }
    }

    toggle.addEventListener('click', () => {
        filtersContainer.classList.toggle('collapsed');
        // Guardamos que el usuario ya interactuó con el botón en esta sesión
        filtersContainer.dataset.userToggled = 'true';
    });

    window.addEventListener('resize', syncOnResize);
    syncOnResize(); // Ejecutar al cargar la página
})();

// ============================================================
//  CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://wlbwrjsbwxcullsaclon.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iU6UHYMHkKG9fHI24342Jw_G7E0-S08';
const TABLA_EXTINTORES = 'Extintores_Prueba';
const TABLA_OBSERVACIONES = 'observaciones_prueba';
const TABLA_MOVIMIENTOS = 'movimientos_prueba';
const BUCKET_NAME = 'Extintores';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TABLA_USUARIOS = 'usuarios';
const AREAS_CON_PENDIENTE = [
    'transporte', 'operaciones agrícolas', 'ing. agrícola', 'fitosanidad',
    'cosecha', 'control de maleza', 'agronomía',
    'administración 1', 'administración 2', 'administración 3'
];

function requierePendiente(areaResponsable) {
    const area = String(areaResponsable || '').trim().toLowerCase();
    return AREAS_CON_PENDIENTE.some(a => area.includes(a));
}
let isAdmin = sessionStorage.getItem('extintor_admin') === 'true';

// ============================================================
//  REFERENCIAS DOM
// ============================================================
const condicionFilter = document.getElementById('condicion-filter');
if (condicionFilter) {
    condicionFilter.addEventListener('change', (e) => {
        globalCondicionFilter = e.target.value;
        applyFilters();
    });
}

const tableBody = document.getElementById('table-body');
const detailModal = document.getElementById('detail-modal');
const loanModal = document.getElementById('loan-modal');
const historyModal = document.getElementById('history-modal');
const observationsModal = document.getElementById('observations-modal');
const observationFormModal = document.getElementById('observation-form-modal');
const editorModal = document.getElementById('editor-modal');
const numeroFilter = document.getElementById('numero-filter');
const counterDisplay = document.getElementById('counter-display');

let currentItemIndex = null;
let extintorBajaOrigen = null;
let extintoresReemplazados = {};
let observacionesPublicas = [];
let historialCompleto = [];
let currentFilteredData = [];
let misDatos = [];
let movimientosActivos = {};
let movimientosPrestamoActivos = {};
let movimientosGarantiaActivos = {};
let nuevoReemplazoData = {};
let editorModoCreacion = false;
let currentTab = 'todos';
let currentSubTab = 'stock';
let globalCondicionFilter = '';

function limpiarFiltros() {
    document.getElementById('area-filter').value = '';
    document.getElementById('numero-filter').value = '';
    document.getElementById('serie-filter').value = '';
    document.getElementById('tipo-filter').value = '';
    document.getElementById('capacidad-filter').value = '';
      const condSelect = document.getElementById('condicion-filter');
    if (condSelect) condSelect.value = '';
    
    globalCondicionFilter = ''; // <--- ESTA ES LA LÍNEA QUE FALTABA
    
    calRangeStart = null;
    calRangeEnd = null;
    calPendingDesde = "";
    calPendingHasta = "";
    updateDateLabel();
    applyFilters();
}
function cambiarTab(tab, element) {
    currentTab = tab;
    globalCondicionFilter = '';

    // Resetear select de condición
    const selectCond = document.getElementById('condicion-filter');
    if (selectCond) selectCond.value = '';

    // Resetear inputs de filtros (se ocultan al cambiar de pestaña,
    // pero su .value persiste y applyFilters() lo sigue leyendo)
    const areaInput = document.getElementById('area-filter');
    if (areaInput) areaInput.value = '';
    const areaClear = document.getElementById('area-clear');
    if (areaClear) areaClear.style.display = 'none';

    const numeroInput = document.getElementById('numero-filter');
    if (numeroInput) numeroInput.value = '';

    const serieInput = document.getElementById('serie-filter');
    if (serieInput) serieInput.value = '';

    const tipoInput = document.getElementById('tipo-filter');
    if (tipoInput) tipoInput.value = '';

    const capInput = document.getElementById('capacidad-filter');
    if (capInput) capInput.value = '';

    // Resetear rango de fechas del calendario
    calRangeStart = null;
    calRangeEnd = null;
    calPendingDesde = '';
    calPendingHasta = '';
    const calStatusEl = document.getElementById('cal-status');
    if (calStatusEl) calStatusEl.textContent = 'Selecciona la fecha de inicio';
    const calApplyEl = document.getElementById('cal-apply');
    if (calApplyEl) calApplyEl.disabled = true;
    updateDateLabel();

    // Marcar pestaña activa
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');

    const subTabs = document.getElementById('sub-tabs-almacen');
    if (tab === 'almacen') {
        subTabs.style.display = 'flex';
    } else {
        subTabs.style.display = 'none';
    }

    actualizarVisibilidadFiltros();
    applyFilters();
}

function cambiarSubTab(subTab, element) {
    currentSubTab = subTab;
    const btnStock = document.getElementById('btn-sub-stock');
    const btnAsig = document.getElementById('btn-sub-asignados');
    const btnOtras = document.getElementById('btn-sub-otras'); // <-- NUEVO

    // Resetear estilos
    [btnStock, btnAsig, btnOtras].forEach(btn => {
        if(btn) { btn.style.background = '#fff'; btn.style.color = '#64748b'; btn.style.border = '1px solid #cbd5e1'; }
    });

    // Pintar de verde el activo
    if (subTab === 'stock') { btnStock.style.background = '#16a34a'; btnStock.style.color = 'white'; btnStock.style.border = 'none'; }
    else if (subTab === 'asignados') { btnAsig.style.background = '#16a34a'; btnAsig.style.color = 'white'; btnAsig.style.border = 'none'; }
    else if (subTab === 'otras') { btnOtras.style.background = '#16a34a'; btnOtras.style.color = 'white'; btnOtras.style.border = 'none'; }

    applyFilters();
}
function filtrarPorKPI(tipo) {
    if (currentTab !== 'todos') {
        cambiarTab('todos', document.querySelector('.tab-btn')); 
    }
    
    let valorFiltro = '';
    if (tipo === 'vigente') valorFiltro = 'Vigente';
    else if (tipo === 'por_vencer') valorFiltro = 'PorVencer';
    else if (tipo === 'vencido') valorFiltro = 'Vencido';
    
    globalCondicionFilter = valorFiltro;

    // Sincronizar el select visualmente
    const selectCond = document.getElementById('condicion-filter');
    if (selectCond) {
        // Verificamos si la opción existe en el select (PorVencer no está en público)
        const opcionExiste = Array.from(selectCond.options).some(opt => opt.value === valorFiltro);
        selectCond.value = opcionExiste ? valorFiltro : '';
    }

    applyFilters();
}

// ============================================================
//  COMPONENTE AUTOCOMPLETADO REUTILIZABLE
// ============================================================
function crearAutocomplete({ input, dropdown, clearBtn, getOptions, onSelect, onInput }) {
    let opcionesActuales = [];
    let activeIndex = -1;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    function scoreMatch(texto, query) {
        if (!query) return 1;
        const t = texto.toLowerCase();
        const q = query.toLowerCase();
        if (t === q) return 1000;
        if (t.startsWith(q)) return 500 - (t.length - q.length);
        const idx = t.indexOf(q);
        if (idx !== -1) return 300 - idx;
        let ti = 0, qi = 0, gaps = 0, lastMatch = -1;
        while (ti < t.length && qi < q.length) {
            if (t[ti] === q[qi]) {
                if (lastMatch !== -1) gaps += ti - lastMatch - 1;
                lastMatch = ti;
                qi++;
            }
            ti++;
        }
        if (qi === q.length) return 100 - gaps;
        return -1;
    }

    function resaltar(texto, query) {
        if (!query) return escapeHtml(texto);
        const t = texto.toLowerCase();
        const q = query.toLowerCase();
        const idx = t.indexOf(q);
        if (idx !== -1) {
            return escapeHtml(texto.slice(0, idx)) +
                   '<mark>' + escapeHtml(texto.slice(idx, idx + q.length)) + '</mark>' +
                   escapeHtml(texto.slice(idx + q.length));
        }
        let result = '';
        let qi = 0;
        for (let i = 0; i < texto.length; i++) {
            if (qi < q.length && texto[i].toLowerCase() === q[qi]) {
                result += '<mark>' + escapeHtml(texto[i]) + '</mark>';
                qi++;
            } else {
                result += escapeHtml(texto[i]);
            }
        }
        return result;
    }

    function render() {
        dropdown.innerHTML = '';
        activeIndex = -1;
        if (opcionesActuales.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'autocomplete-empty';
            empty.textContent = 'Sin coincidencias. Puede escribir un valor nuevo.';
            dropdown.appendChild(empty);
            return;
        }
        opcionesActuales.forEach((opt) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerHTML = resaltar(opt, input.value.trim());
            item.dataset.value = opt;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                seleccionar(opt);
            });
            dropdown.appendChild(item);
        });
    }

    function seleccionar(valor) {
        input.value = valor;
        cerrar();
        actualizarClear();
        if (onSelect) onSelect(valor);
        if (onInput) onInput(valor);
    }

    function abrir() { dropdown.classList.add('open'); }
    function cerrar() { dropdown.classList.remove('open'); activeIndex = -1; }
    function actualizarClear() {
        if (!clearBtn) return;
        clearBtn.style.display = input.value.trim() ? 'block' : 'none';
    }

    function filtrar() {
        const q = input.value.trim();
        const todas = getOptions();
        if (!q) {
            opcionesActuales = [...todas];
        } else {
            opcionesActuales = todas
                .map(opt => ({ opt, score: scoreMatch(opt, q) }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score || a.opt.localeCompare(b.opt, 'es', { sensitivity: 'base' }))
                .map(x => x.opt);
        }
        render();
    }

    input.addEventListener('focus', () => { filtrar(); abrir(); });

    input.addEventListener('input', () => {
        filtrar();
        abrir();
        actualizarClear();
        if (onInput) onInput(input.value.trim());
    });

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length === 0) return;
            activeIndex = (activeIndex + 1) % items.length;
            items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length === 0) return;
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && items[activeIndex]) {
                e.preventDefault();
                seleccionar(items[activeIndex].dataset.value);
            }
        } else if (e.key === 'Escape') {
            cerrar();
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = '';
            actualizarClear();
            if (onInput) onInput('');
            if (onSelect) onSelect('');
            filtrar();
            abrir();
            input.focus();
        });
    }

    document.addEventListener('click', (e) => {
        if (!input.parentElement.contains(e.target)) {
            cerrar();
        }
    });

    return {
        refrescar: () => { filtrar(); actualizarClear(); },
        cerrar,
        getValor: () => input.value.trim()
    };
}

// ============================================================
//  MODALES GENÉRICOS
// ============================================================
let genericResolve = null;
let promptResolve = null;

function showGenericModal(message, title = 'Aviso', confirmText = 'Aceptar', cancelText = null) {
    return new Promise((resolve) => {
        document.querySelector('.menu-dropdown')?.classList.remove('open'); 
        const modal = document.getElementById('generic-modal');
        document.getElementById('generic-modal-title').textContent = title;
        document.getElementById('generic-modal-body').textContent = message;
        const confirmBtn = document.getElementById('generic-modal-confirm-btn');
        const cancelBtn = document.getElementById('generic-modal-cancel-btn');
        confirmBtn.textContent = confirmText;
        if (cancelText) {
            cancelBtn.style.display = 'inline-block';
            cancelBtn.textContent = cancelText;
        } else {
            cancelBtn.style.display = 'none';
        }
        genericResolve = resolve;
        modal.classList.add('active');
    });
}
function confirmGenericModal() {
    document.getElementById('generic-modal').classList.remove('active');
    const resolver = genericResolve;
    genericResolve = null;
    quitarModal(document.getElementById('generic-modal'));
    if (resolver) resolver(true);
}
function cancelGenericModal() { document.getElementById('generic-modal').classList.remove('active');  closeGenericModal(); if (genericResolve) genericResolve(false); genericResolve = null; }
function closeGenericModal() { document.getElementById('generic-modal').classList.remove('active'); if (genericResolve) genericResolve(false); genericResolve = null; }

function showPromptModal(message, title = 'Ingrese información', defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('prompt-modal');
        document.getElementById('prompt-modal-title').textContent = title;
        document.getElementById('prompt-modal-message').textContent = message;
        const input = document.getElementById('prompt-modal-input');
        input.value = defaultValue;
        input.focus();
        promptResolve = resolve;
        modal.classList.add('active');
    });
}
function acceptPrompt() { const input = document.getElementById('prompt-modal-input'); const value = input.value.trim(); document.getElementById('prompt-modal').classList.remove('active'); if (promptResolve) promptResolve(value); promptResolve = null; }
function closePromptModal() { document.getElementById('prompt-modal').classList.remove('active'); if (promptResolve) promptResolve(null); promptResolve = null; }

document.getElementById('generic-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGenericModal(); });
document.getElementById('prompt-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePromptModal(); });

// ============================================================
//  ADMINISTRADOR Y FILTROS
// ============================================================
function actualizarMenuAdmin() {
    const btnLogin = document.getElementById('btnLogin');
    const btnObservaciones = document.getElementById('btnObservaciones');
    const btnHistorial = document.getElementById('btnHistorial');
    const btnExportar = document.getElementById('btnExportar');
    
    // Botones que agregaremos en el siguiente paso
    const btnAgregarExtintor = document.getElementById('btnAgregarExtintor');
    const menuDescartados = document.getElementById('menuDescartados'); 
    if (isAdmin) {
        const nombreAdmin = sessionStorage.getItem('extintor_admin_nombre') || 'Administrador';
        const rolAdmin = sessionStorage.getItem('extintor_admin_rol') || 'admin';
        
        // Cambiamos el botón de login por el perfil del admin
        if (btnLogin) {
            btnLogin.innerHTML = `<i class="fas fa-user-circle"></i> ${nombreAdmin} (${rolAdmin})`;
            btnLogin.style.background = '#dcfce7';
            btnLogin.style.color = '#15803d';
        }

        // Mostramos los botones de acciones
        if (btnObservaciones) btnObservaciones.style.display = 'inline-flex';
        if (btnHistorial) btnHistorial.style.display = 'inline-flex';
        if (btnExportar) btnExportar.style.display = 'inline-flex';
        
        if (btnAgregarExtintor) btnAgregarExtintor.style.display = 'inline-flex';
        if (menuDescartados) menuDescartados.style.display = 'inline-flex';
    } else {
        // Estado público (Sin loguear)
        if (btnLogin) {
            btnLogin.innerHTML = `<i class="fas fa-user-circle"></i> Ingresar`;
            btnLogin.style.background = '#f1f5f9';
            btnLogin.style.color = '#0f172a';
        }

        // Ocultamos los botones de acciones
        if (btnObservaciones) btnObservaciones.style.display = 'none';
        if (btnHistorial) btnHistorial.style.display = 'none';
        if (btnExportar) btnExportar.style.display = 'none';
        
        if (btnAgregarExtintor) btnAgregarExtintor.style.display = 'none';
        if (menuDescartados) menuDescartados.style.display = 'none';
    }
}

function aplicarPermisos() {
    const estadoHeader = document.getElementById('estado-header');
    const garantiaHeader = document.getElementById('garantia-header');
    const tableHead = document.getElementById('table-head');
    const mainTabs = document.getElementById('main-tabs');
    const subTabs = document.getElementById('sub-tabs-almacen');
    const kpiGrid = document.querySelector('.kpi-grid'); // <-- NUEVO

    if (tableHead) {
        const ths = tableHead.querySelectorAll('th');
        if (isAdmin) {
            // ADMIN: Ve todo
            ths.forEach(th => th.style.display = 'table-cell');
            if (estadoHeader) estadoHeader.style.display = 'table-cell';
            if (garantiaHeader) garantiaHeader.style.display = 'table-cell';
            if (mainTabs) mainTabs.style.display = 'flex';
            if (subTabs && currentTab === 'almacen') subTabs.style.display = 'flex';
            if (kpiGrid) kpiGrid.style.display = 'grid'; // mostrar KPIs
        } else {
            // PÚBLICO: solo oculta GARANTÍA (8) y ESTADO (9)
            ths.forEach((th, index) => {
                if ([8, 9].includes(index + 1)) {
                    th.style.display = 'none';
                } else {
                    th.style.display = 'table-cell';
                }
            });
            if (mainTabs) mainTabs.style.display = 'none';
            if (subTabs) subTabs.style.display = 'none';
            if (kpiGrid) kpiGrid.style.display = 'none'; // ocultar KPIs
        }
    }
    
    actualizarOpcionesCondicion();
    actualizarMenuAdmin();
    actualizarVisibilidadFiltros();
}
function actualizarOpcionesCondicion() {
    const select = document.getElementById('condicion-filter');
    if (!select) return;

    // Si es admin, no hacemos nada porque el filtro está oculto
    if (isAdmin) return;

    const valorActual = select.value;
    select.innerHTML = `
        <option value="">Todas las condiciones</option>
        <option value="Vigente">Vigente</option>
        <option value="Vencido">Vencido</option>
    `;
    
    // Mantener la selección si ya había una válida
    if (['Vigente', 'Vencido'].includes(valorActual)) {
        select.value = valorActual;
    }
}
async function cargarMovimientosActivos() {
    try {
        const { data, error } = await supabaseClient
            .from(TABLA_MOVIMIENTOS)
            .select('*')
            .eq('activo', true)
            .in('tipo', ['prestamo_interno', 'prestamo_unidad', 'garantia']);

        if (error) {
            console.error('Error cargando movimientos activos:', error);
            return;
        }

        movimientosPrestamoActivos = {};
        movimientosGarantiaActivos = {};
        movimientosActivos = {};

        data.forEach(mov => {
            const fecha = new Date(mov.created_at).toLocaleString('es-ES');

            if (mov.tipo === 'prestamo_interno' || mov.tipo === 'prestamo_unidad') {
                movimientosPrestamoActivos[mov.n_extintor] = {
                    tipo: mov.tipo,
                    personal: mov.personal,
                    motivo: mov.motivo,
                    reemplazo: mov.reemplazo,
                    responsable_destino: mov.responsable_destino,
                    ubicacion_destino: mov.ubicacion_destino,
                    fecha: fecha
                };
                movimientosActivos[mov.n_extintor] = movimientosPrestamoActivos[mov.n_extintor];
            } else if (mov.tipo === 'garantia') {
                movimientosGarantiaActivos[mov.n_extintor] = {
                    reemplazo: mov.reemplazo,
                    personal: mov.personal,
                    fecha: fecha
                };
                if (!movimientosPrestamoActivos[mov.n_extintor]) {
                    movimientosActivos[mov.n_extintor] = movimientosGarantiaActivos[mov.n_extintor];
                }
            }
        });
    } catch (err) {
        console.error('Error inesperado:', err);
    }
}

async function actualizarUnExtintor(numero) {
    try {
        const { data, error } = await supabaseClient
            .from(TABLA_EXTINTORES)
            .select('*')
            .eq('N', numero)
            .single();

        if (error) {
            console.error('Error actualizando extintor:', error);
            return null;
        }

        const idx = misDatos.findIndex(item => String(item["N"]) === String(numero));
        if (idx !== -1) {
            misDatos[idx] = data;
        } else {
            misDatos.push(data);
        }

        return data;
    } catch (err) {
        console.error('Error inesperado:', err);
        return null;
    }
}

async function activarAdmin() {
    if (isAdmin) {
        sessionStorage.removeItem('extintor_admin');
        sessionStorage.removeItem('extintor_admin_nombre');
        sessionStorage.removeItem('extintor_admin_rol');
        isAdmin = false;
        aplicarPermisos();
        await showGenericModal('Sesión de administrador cerrada.', 'Aviso');
        location.reload();
        return;
    }

    const password = await showPromptModal('Ingrese la contraseña de Administrador:', 'Acceso Administrador');
    if (!password) return;

    const USUARIO_ADMIN = 'Seguridad Industrial';

    const { data, error } = await supabaseClient
        .from(TABLA_USUARIOS)
        .select('*')
        .eq('usuario', USUARIO_ADMIN)
        .eq('contrasena', password.trim())
        .eq('activo', true)
        .maybeSingle();

    if (error) {
        console.error(error);
        await showGenericModal('Error al validar: ' + error.message, 'Error');
        return;
    }

    if (!data) {
        await showGenericModal('Contraseña incorrecta.', 'Error');
        return;
    }

    isAdmin = true;
    sessionStorage.setItem('extintor_admin', 'true');
    sessionStorage.setItem('extintor_admin_nombre', data.usuario);
    sessionStorage.setItem('extintor_admin_rol', data.rol);
    aplicarPermisos();
    await showGenericModal(`¡Bienvenido, ${data.usuario}!`, 'Éxito');
    location.reload();
}
aplicarPermisos();

// ============================================================
//  FUNCIONES AUXILIARES
// ============================================================
function getGarantiaReemplazo(item) {
    const no = String(item["N"]);
    if (movimientosGarantiaActivos[no]) {
        return movimientosGarantiaActivos[no].reemplazo || '-';
    }
    return '-';
}

// ============================================================
//  PARSEO DE FECHAS
// ============================================================
const MESES = { jan: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, apr: 4, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, aug: 8, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dec: 12, dic: 12, diciembre: 12 };
function getMonthYear(dateStr) { if (!dateStr || String(dateStr).trim() === "") return null; const value = String(dateStr).trim().toLowerCase().replace(/\./g,'').replace(/\s+/g,''); let match = value.match(/^(\d{1,2})[\/-](\d{2}|\d{4})$/); if (match) { const month = Number(match[1]); let year = Number(match[2]); if (month >= 1 && month <= 12) { if (year < 100) year += 2000; return { month, year }; } } match = value.match(/^(\d{2}|\d{4})[\/-]([a-záéíóúñ]+)$/i); if (match) { let year = Number(match[1]); const month = MESES[match[2]]; if (month) { if (year < 100) year += 2000; return { month, year }; } } match = value.match(/^([a-záéíóúñ]+)[\/-](\d{2}|\d{4})$/i); if (match) { let year = Number(match[2]); const month = MESES[match[1]]; if (month) { if (year < 100) year += 2000; return { month, year }; } } return null; }
function parseDate(dateStr) {
    const result = getMonthYear(dateStr);
    if (!result) return null;
    return new Date(result.year, result.month - 1, 1, 0, 0, 0, 0);
}
function formatMonthYear(dateStr) { const result = getMonthYear(dateStr); if (!result) return dateStr || "-"; return `${String(result.month).padStart(2, '0')}/${result.year}`; }
function isExpired(dateStr) { const date = parseDate(dateStr); return date ? date < new Date() : false; }
function isItemExpired(item) {
    const fechaEfectiva = (item["proxima_recarga"] && String(item["proxima_recarga"]).trim() !== "")
        ? item["proxima_recarga"]
        : item["F. VENC."];
    return isExpired(fechaEfectiva);
}

// ============================================================
//  CONDICIÓN, ESTADO, UBICACIÓN
// ============================================================
function getCondicionItem(item) {
    const condicion = String(item["CONDICION"] ?? "").trim();
    const condicionFisica = ['Usado', 'Despresurizado', 'Dañado'].includes(condicion);
    if (isAdmin && (condicionFisica || condicion === 'Baja')) return condicion;
    return isItemExpired(item) || (!isAdmin && condicionFisica) ? "Vencido" : "Vigente";
}
function escapeCondicion(valor) {
    return String(valor).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function getEstadoItem(item) {
    if (!isAdmin) return "-";
    const estado = item["ESTADO"] || "";
    if (estado === "Prestado" || estado === "Almacén SST" ||
        estado === "Extintor pendiente" || estado === "Garantía - Recibido") return estado;
    return "";
}
function getBadgeClass(condicion) {
    const map = {
        'Vigente': 'badge-vigente',
        'Vencido': 'badge-vencido',
        'Usado': 'badge-usado',
        'Despresurizado': 'badge-despresurizado',
        'Dañado': 'badge-danado',
        'Mantenimiento': 'badge-mantenimiento',
        'Baja': 'badge-baja',
        'Garantía': 'badge-garantia'
    };
    return map[condicion] || 'badge-vigente';
}

function getEstadoBadgeClass(estado) {
    if (estado === 'Prestado') return 'badge-prestado';
    if (estado === 'Almacén SST') return 'badge-almacen';
    if (estado === 'Extintor pendiente') return 'badge-garantia-pendiente';
    if (estado === 'Garantía - Recibido') return 'badge-garantia-recibido';
    return '';
}
function limpiar(valor) { return (valor !== undefined && valor !== null && String(valor).trim() !== "") ? valor : "-"; }

function getUbicacionAsignada(item, esAdmin) {
    const estado = item["ESTADO"] || "";
    const ubicacion = String(item["UBICACION"] || "").trim();
    if (!esAdmin && estado === "Prestado" && ubicacion.toUpperCase() === "STOCK") {
        return "-";
    }
    return item["UBICACION"] || "-";
}

// ============================================================
//  CALENDARIO
// ============================================================
let calRangeStart = null, calRangeEnd = null, calVisibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calPendingDesde = "", calPendingHasta = "";
const dateTrigger = document.getElementById('date-trigger');
const calendarPopup = document.getElementById('calendar-popup');
const dateLabel = document.getElementById('date-label');
const calDaysContainer = document.getElementById('cal-days');
const calMonthLabel = document.getElementById('cal-month-label');
const calStatus = document.getElementById('cal-status');
const calClearBtn = document.getElementById('cal-clear');
const calApplyBtn = document.getElementById('cal-apply');

function toIsoMonth(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

// Reemplaza la función renderCalendar() existente por esta:
const MESES_NOMBRES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function renderCalendar() {
    // Ahora solo mostramos el AÑO en el encabezado, no el mes
    calMonthLabel.textContent = calVisibleMonth.getFullYear(); 
    calDaysContainer.innerHTML = '';
    const year = calVisibleMonth.getFullYear();

    // Generamos los 12 meses
    for (let month = 0; month < 12; month++) {
        const current = new Date(year, month, 1);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = MESES_NOMBRES[month];

        // Lógica para pintar el rango seleccionado
        if (calRangeStart && calRangeEnd) {
            const currentIdx = year * 12 + month;
            const startIdx = calRangeStart.getFullYear() * 12 + calRangeStart.getMonth();
            const endIdx = calRangeEnd.getFullYear() * 12 + calRangeEnd.getMonth();

            if (currentIdx === startIdx) btn.classList.add('selected', 'range-start');
            if (currentIdx === endIdx) btn.classList.add('selected', 'range-end');
            if (currentIdx > startIdx && currentIdx < endIdx) btn.classList.add('in-range');
        } else if (calRangeStart) {
            // Si solo hay inicio seleccionado
            if (year === calRangeStart.getFullYear() && month === calRangeStart.getMonth()) {
                btn.classList.add('selected', 'range-start', 'range-end');
            }
        }

        btn.addEventListener('click', (e) => { e.stopPropagation(); selectCalendarDate(current); });
        calDaysContainer.appendChild(btn);
    }
}

// Reemplaza la función selectCalendarDate() por esta:
function selectCalendarDate(date) {
    if (!calRangeStart || (calRangeStart && calRangeEnd)) {
        calRangeStart = date;
        calRangeEnd = null;
        calStatus.textContent = 'Ahora selecciona el mes final';
        calApplyBtn.disabled = true;
    } else {
        if (date < calRangeStart) { 
            calRangeEnd = calRangeStart; 
            calRangeStart = date; 
        } else { 
            calRangeEnd = date; 
        }
        const formatM = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        calStatus.textContent = `Rango: ${formatM(calRangeStart)} - ${formatM(calRangeEnd)}`;
        calApplyBtn.disabled = false;
    }
    updateDateLabel();
    renderCalendar();
}

// Reemplaza la función updateDateLabel() por esta:
function updateDateLabel() {
    const formatM = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    if (calRangeStart && calRangeEnd) dateLabel.textContent = `${formatM(calRangeStart)} - ${formatM(calRangeEnd)}`;
    else if (calRangeStart && !calRangeEnd) dateLabel.textContent = `${formatM(calRangeStart)} - ...`;
    else dateLabel.textContent = 'Rango de vencimiento';
}
function openCalendar() { calendarPopup.classList.add('open'); dateTrigger.classList.add('open'); dateTrigger.setAttribute('aria-expanded','true'); }
function closeCalendar() { calendarPopup.classList.remove('open'); dateTrigger.classList.remove('open'); dateTrigger.setAttribute('aria-expanded','false'); }
function clearCalendarRange() { calRangeStart = null; calRangeEnd = null; calPendingDesde = ""; calPendingHasta = ""; calStatus.textContent = 'Selecciona la fecha de inicio'; calApplyBtn.disabled = true; updateDateLabel(); renderCalendar(); applyFilters(); }

dateTrigger.addEventListener('click', (e) => { e.stopPropagation(); if (calendarPopup.classList.contains('open')) closeCalendar(); else openCalendar(); });
document.getElementById('cal-prev').addEventListener('click', (e) => { 
    e.stopPropagation(); 
    calVisibleMonth.setFullYear(calVisibleMonth.getFullYear() - 1); 
    renderCalendar(); 
});
document.getElementById('cal-next').addEventListener('click', (e) => { 
    e.stopPropagation(); 
    calVisibleMonth.setFullYear(calVisibleMonth.getFullYear() + 1); 
    renderCalendar(); 
});
calClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearCalendarRange(); });
calApplyBtn.addEventListener('click', (e) => { e.stopPropagation(); if (calRangeStart && calRangeEnd) { calPendingDesde = toIsoMonth(calRangeStart); calPendingHasta = toIsoMonth(calRangeEnd); closeCalendar(); applyFilters(); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.date-filter-wrap')) closeCalendar(); });

function getMonthIndex(dateStr) {
    const isoMonth = String(dateStr ?? "").match(/^(\d{4})-(\d{2})$/);
    if (isoMonth) { const month = Number(isoMonth[2]); if (month >= 1 && month <= 12) return Number(isoMonth[1]) * 12 + month; }
    const parsed = getMonthYear(dateStr);
    return parsed ? parsed.year * 12 + parsed.month : null;
}
function getEstadoVencimiento(item) {
    if (isItemExpired(item)) return 'Vencido';
    const fecha = (item["proxima_recarga"] && String(item["proxima_recarga"]).trim() !== "")
        ? item["proxima_recarga"] : item["F. VENC."];
    const hoy = new Date();
    return getMonthIndex(fecha) === hoy.getFullYear() * 12 + hoy.getMonth() + 1
        ? 'PorVencer' : 'Vigente';
}
function itemMatchesDateRange(item, desde, hasta) {
    if (!desde && !hasta) return true;
    const inicio = desde ? getMonthIndex(desde) : null;
    const fin = hasta ? getMonthIndex(hasta) : null;
    if (inicio !== null && fin !== null && inicio > fin) return false;
    const fechaEfectiva = (item["proxima_recarga"] && String(item["proxima_recarga"]).trim() !== "")
        ? item["proxima_recarga"]
        : item["F. VENC."];
    const fechaItem = getMonthIndex(fechaEfectiva);
    if (fechaItem === null) return false;
    if (inicio !== null && fechaItem < inicio) return false;
    if (fin !== null && fechaItem > fin) return false;
    return true;
}
// ============================================================
//  FILTROS DINÁMICOS (TIPO Y CAPACIDAD)
// ============================================================

function actualizarFiltrosDesdeDB() {
    if (!misDatos || misDatos.length === 0) return;

    const tiposSet = new Set();
    misDatos.forEach(item => {
        if (item["TIPO"] && String(item["TIPO"]).trim() !== "") {
            tiposSet.add(String(item["TIPO"]).trim().toUpperCase());
        }
    });
    const tiposArray = Array.from(tiposSet).sort();

    const tipoSelect = document.getElementById('tipo-filter');
    const valorTipoActual = tipoSelect.value;

    tipoSelect.innerHTML = '<option value="">Todos los tipos</option>';
    tiposArray.forEach(tipo => {
        tipoSelect.innerHTML += `<option value="${tipo}">${tipo}</option>`;
    });
    
    if (tiposArray.includes(valorTipoActual)) {
        tipoSelect.value = valorTipoActual;
    } else {
        tipoSelect.value = "";
    }

    actualizarCapacidadesPorTipo();
}

function actualizarCapacidadesPorTipo() {
    const tipoSelect = document.getElementById('tipo-filter');
    const capacidadSelect = document.getElementById('capacidad-filter');
    const tipoSeleccionado = tipoSelect.value.toUpperCase();

    const capacidadesSet = new Set();
    
    misDatos.forEach(item => {
        if (tipoSeleccionado && String(item["TIPO"]).toUpperCase().trim() !== tipoSeleccionado) {
            return;
        }
        
        if (item["CAP."] && String(item["CAP."]).trim() !== "") {
            let cap = String(item["CAP."]).trim().toLowerCase();
            capacidadesSet.add(cap);
        }
    });

    const capacidadesArray = Array.from(capacidadesSet).sort((a, b) => {
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.localeCompare(b);
    });

    const valorCapActual = capacidadSelect.value.toLowerCase();

    capacidadSelect.innerHTML = '<option value="">Cualquier capacidad</option>';
    capacidadesArray.forEach(cap => {
        capacidadSelect.innerHTML += `<option value="${cap}">${cap}</option>`;
    });

    if (capacidadesArray.includes(valorCapActual)) {
        capacidadSelect.value = valorCapActual;
    } else {
        capacidadSelect.value = "";
    }
}

// Escuchar cuando el usuario cambie el tipo de extintor
document.getElementById('tipo-filter').addEventListener('change', () => {
    actualizarCapacidadesPorTipo();
    applyFilters(); 
});

function compararNumeros(a, b) {
    const na = Number(String(a["N"] ?? "").replace(",", "."));
    const nb = Number(String(b["N"] ?? "").replace(",", "."));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a["N"] ?? "").localeCompare(String(b["N"] ?? ""), "es", { numeric: true });
}

let responsableAutocomplete = null;
let unidadAreaAutocomplete = null;

function obtenerAreasResponsables() {
    return [...new Set(
        misDatos.map(item => String(item["AREA RESPONSABLE"] ?? "").trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function poblarResponsables() {
    if (responsableAutocomplete) responsableAutocomplete.refrescar();
    if (unidadAreaAutocomplete) unidadAreaAutocomplete.refrescar();
}

function actualizarVisibilidadFiltros() {
    const gArea = document.getElementById('filter-group-area');
    const gNumero = document.getElementById('filter-group-numero');
    const gSerie = document.getElementById('filter-group-serie');
    const gVencimiento = document.getElementById('filter-group-vencimiento');
    const gTipo = document.getElementById('tipo-filter')?.closest('.filter-group');
    const gCapacidad = document.getElementById('capacidad-filter')?.closest('.filter-group');
    const gCondicion = document.getElementById('filter-group-condicion');
    
    if (isAdmin) {
        if (currentTab === 'almacen') {
            // En Almacén SST: solo Tipo y Capacidad
            if (gArea) gArea.style.display = 'none';
            if (gNumero) gNumero.style.display = 'none';
            if (gSerie) gSerie.style.display = 'none';
            if (gVencimiento) gVencimiento.style.display = 'none';
            if (gTipo) gTipo.style.display = 'block';
            if (gCapacidad) gCapacidad.style.display = 'block';
            if (gCondicion) gCondicion.style.display = 'none';
        } else {
            // En otras pestañas admin: todo excepto Condición
            if (gArea) gArea.style.display = 'block';
            if (gNumero) gNumero.style.display = 'block';
            if (gSerie) gSerie.style.display = 'block';
            if (gVencimiento) gVencimiento.style.display = 'block';
            if (gTipo) gTipo.style.display = 'block';
            if (gCapacidad) gCapacidad.style.display = 'block';
            if (gCondicion) gCondicion.style.display = 'none';
        }
    } else {
        // Público ve SOLO Área y Condición
        if (gArea) gArea.style.display = 'block';
        if (gCondicion) gCondicion.style.display = 'block';
        if (gNumero) gNumero.style.display = 'none';
        if (gSerie) gSerie.style.display = 'none';
        if (gVencimiento) gVencimiento.style.display = 'none';
        if (gTipo) gTipo.style.display = 'none';
        if (gCapacidad) gCapacidad.style.display = 'none';
    }
}
function inicializarAutocompletes() {
    const filtroAreaInput = document.getElementById('area-filter');
    const filtroAreaDropdown = document.getElementById('area-dropdown');
    const filtroAreaClear = document.getElementById('area-clear');
    if (filtroAreaInput) {
        crearAutocomplete({
            input: filtroAreaInput,
            dropdown: filtroAreaDropdown,
            clearBtn: filtroAreaClear,
            getOptions: obtenerAreasResponsables,
            onSelect: () => applyFilters(),
            onInput: () => applyFilters()
        });
    }
    
    // Filtro de número de extintor
    const numeroFilter = document.getElementById('numero-filter');
    if (numeroFilter) {
        numeroFilter.addEventListener('input', () => applyFilters());
    }
    
    // Filtro de número de serie
    const serieFilter = document.getElementById('serie-filter');
    if (serieFilter) {
        serieFilter.addEventListener('input', () => applyFilters());
    }

    // Autocomplete del formulario de préstamo (campo Área destino)
    const unidadAreaInput = document.getElementById('unidad-area');
    const unidadAreaDropdown = document.getElementById('unidad-area-dropdown');
    const unidadAreaClear = document.getElementById('unidad-area-clear');
    if (unidadAreaInput && unidadAreaDropdown) {
        unidadAreaAutocomplete = crearAutocomplete({
            input: unidadAreaInput,
            dropdown: unidadAreaDropdown,
            clearBtn: unidadAreaClear,
            getOptions: obtenerAreasResponsables,
            onSelect: () => {},
            onInput: () => {}
        });
    }
}
function updateCounter(mostrados, total) {
    counterDisplay.innerHTML = `Mostrando <strong>${mostrados}</strong> de <strong>${total}</strong> extintores`;
}
function actualizarTarjetasResumen() {
    const kpiTotal = document.getElementById('kpi-total');
    const kpiVigentes = document.getElementById('kpi-vigentes');
    const kpiPorVencer = document.getElementById('kpi-por-vencer');
    const kpiVencidos = document.getElementById('kpi-vencidos');
    
    if (!kpiTotal) return;

    const activos = misDatos.filter(item => item["CONDICION"] !== 'Baja');
    
    let vigentes = 0;
    let vencidos = 0;
    let porVencer = 0;

    activos.forEach(item => {
        const estadoVencimiento = getEstadoVencimiento(item);
        if (estadoVencimiento === 'Vencido') {
            vencidos++;
        } else if (estadoVencimiento === 'PorVencer') {
            porVencer++;
        } else {
            vigentes++;
        }
    });

    kpiTotal.textContent = activos.length;
    kpiVigentes.textContent = vigentes;
    kpiPorVencer.textContent = porVencer;
    kpiVencidos.textContent = vencidos;
}
// ============================================================
//  APLICAR FILTROS (LA FUNCIÓN QUE FALTABA)
// ============================================================
function applyFilters() {
    // 1. Obtener valores de los inputs
    const areaVal = document.getElementById('area-filter')?.value.toLowerCase().trim() || '';
    const numeroVal = document.getElementById('numero-filter')?.value.toLowerCase().trim() || '';
    const serieVal = document.getElementById('serie-filter')?.value.toLowerCase().trim() || '';
    const tipoVal = document.getElementById('tipo-filter')?.value.toUpperCase().trim() || '';
    const capVal = document.getElementById('capacidad-filter')?.value.toLowerCase().trim() || '';
    const condSelect = document.getElementById('condicion-filter');
    const condVal = condSelect ? condSelect.value : '';

    // 2. Filtrar los datos
    let filtered = misDatos.filter(item => {
        // --- FILTRO POR TABS PRINCIPALES ---
        if (currentTab === 'descartados') {
            if (item["CONDICION"] !== "Baja") return false;
        } else {
            // En 'Todos' y 'Almacén', ocultamos los dados de baja
            if (item["CONDICION"] === "Baja") return false;
        }

           // --- FILTRO POR SUBTABS (ALMACÉN SST) ---
        if (currentTab === 'almacen') {
            const areaResp = String(item["AREA RESPONSABLE"] || "").trim().toUpperCase();
            const ubicAsignada = String(item["UBICACION"] || "").trim().toUpperCase();
            
            let ubicActual = String(item["ubicacion_prestamo"] || "").trim().toLowerCase();
            if (ubicActual === 'null' || ubicActual === '-') ubicActual = "";
            
            const estado = String(item["ESTADO"] || "").trim().toUpperCase();

            // Regla 1: Es propio del SST y su ubicación asignada es STOCK
            const isSstStock = areaResp.includes("SST") && ubicAsignada.includes("STOCK");
            
            // Regla 2: Es de otra área, pero está en mantenimiento/almacén
            const isOtraAreaEnAlmacen = !isSstStock && (
                estado.includes("ALMACÉN SST") || 
                estado.includes("MANTENIMIENTO") || 
                ubicActual.includes("mantenimiento / almacén sst")
            );

            if (currentSubTab === 'stock') {
                if (!isSstStock || ubicActual !== "") return false;
            } 
            else if (currentSubTab === 'asignados') {
                if (!isSstStock || ubicActual === "") return false;
            }
            else if (currentSubTab === 'otras') {
                if (!isOtraAreaEnAlmacen) return false;
            }
        }

        // --- FILTROS DE TEXTO ---
                // --- FILTRO DE ÁREA (incluye préstamos hacia esa área) ---
        if (areaVal) {
            const areaOriginal = (item["AREA RESPONSABLE"] || "").toLowerCase();
            const noItem = String(item["N"]);
            const prestamoActivo = movimientosPrestamoActivos[noItem];
            const areaDestino = prestamoActivo
                ? ((prestamoActivo.responsable_destino || "") + " " + (prestamoActivo.ubicacion_destino || "")).toLowerCase()
                : "";

            if (!areaOriginal.includes(areaVal) && !areaDestino.includes(areaVal)) {
                return false;
            }
        }
        if (numeroVal && !String(item["N"] || "").toLowerCase().includes(numeroVal)) return false;
        if (serieVal && !(item["N SERIE ACTUAL"] || "").toLowerCase().includes(serieVal)) return false;
        
        // --- FILTROS SELECT (TIPO Y CAPACIDAD) ---
        if (tipoVal && (item["TIPO"] || "").toUpperCase().trim() !== tipoVal) return false;
        if (capVal && (item["CAP."] || "").toLowerCase().trim() !== capVal) return false;

        // Los KPI administrativos usan la fecha; el filtro público usa la condición mostrada.
        if (globalCondicionFilter && getEstadoVencimiento(item) !== globalCondicionFilter) return false;
        if (!globalCondicionFilter && condVal && getCondicionItem(item) !== condVal) return false;

        // --- FILTRO DE RANGO DE FECHAS (CALENDARIO) ---
        if ((calPendingDesde || calPendingHasta) && !itemMatchesDateRange(item, calPendingDesde, calPendingHasta)) {
            return false;
        }

        return true;
    });

    // 3. Ordenar los resultados
    currentFilteredData = filtered.sort(compararNumeros);

    // 4. Renderizar la tabla y actualizar contadores
    renderTable(currentFilteredData);
    
    // El total mostrado depende de en qué pestaña esté el usuario
    const totalTab = currentTab === 'descartados' 
        ? misDatos.filter(i => i["CONDICION"] === 'Baja').length 
        : misDatos.filter(i => i["CONDICION"] !== 'Baja').length;
        
    updateCounter(currentFilteredData.length, totalTab);
    
    // 5. Actualizar KPIs y alertas
    actualizarTarjetasResumen();
    actualizarAlertaGarantias();
}
function renderTable(data) {
    tableBody.innerHTML = "";
    if (data.length === 0) {
        // Público: N°, TIPO, CAP, ÁREA, UBIC ASIG, UBIC ACT, CONDICIÓN = 7 columnas
        const cols = isAdmin ? 9 : 7;
        tableBody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center; padding:24px; color:#94a3b8;">No hay resultados.</td></tr>`;
        return;
    }
    
    [...data].sort(compararNumeros).forEach((item) => {
        const condicion = getCondicionItem(item);
        const estado = getEstadoItem(item);
        const ubicacionAsignada = getUbicacionAsignada(item, isAdmin);
        const ubicacionActual = (item["ubicacion_prestamo"] && item["ubicacion_prestamo"].trim() !== "")
            ? item["ubicacion_prestamo"]
            : "-";
        const garantiaReemplazo = getGarantiaReemplazo(item);

        const row = document.createElement('tr');
        row.setAttribute('data-index', misDatos.indexOf(item));

        // Columnas comunes (admin y público)
        let html = `<td><strong>${item["N"] || "-"}</strong></td>`;
        html += `<td>${item["TIPO"] || "-"}</td>`;
        html += `<td>${item["CAP."] || "-"}</td>`;
        html += `<td>${item["AREA RESPONSABLE"] || "-"}</td>`;
        html += `<td>${ubicacionAsignada}</td>`;
        html += `<td>${ubicacionActual}</td>`;
        html += `<td><span class="badge ${getBadgeClass(condicion)}">${escapeCondicion(condicion)}</span></td>`;

        // Columnas solo para admin
        if (isAdmin) {
            html += `<td>${garantiaReemplazo}</td>`;
            const estadoMostrar = estado || "";
            html += `<td>${estadoMostrar ? `<span class="badge ${getEstadoBadgeClass(estado)}">${estado}</span>` : ""}</td>`;
        }

        row.innerHTML = html;
        row.addEventListener('click', () => {
            currentItemIndex = parseInt(row.getAttribute('data-index'));
            showModal(misDatos[currentItemIndex]);
        });
        tableBody.appendChild(row);
    });
}

// ============================================================
//  HISTORIAL Y OBSERVACIONES
// ============================================================
function verHistorial() {
    renderizarHistorial();
    historyModal.classList.add('active');
}

function renderizarHistorial() {
    const historyBody = document.getElementById('history-body');
    historyBody.innerHTML = '';
    if (historialCompleto.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">No hay movimientos registrados.</td></tr>`;
        return;
    }
    historialCompleto.forEach((mov, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${mov.fecha}</td>
            <td><strong>${mov.no}</strong></td>
            <td>${mov.tipo}</td>
            <td>${mov.personal}</td>
            <td>${mov.detalle}</td>
            <td><button class="btn btn-delete" style="padding:4px 10px; font-size:0.75rem;" onclick="eliminarMovimiento(${index})"><i class="fas fa-trash-alt"></i> Eliminar</button></td>
        `;
        historyBody.appendChild(row);
    });
}

async function eliminarMovimiento(index) {
    const mov = historialCompleto[index];
    if (!mov || !mov.id) {
        await showGenericModal('No se puede eliminar este movimiento (falta ID).', 'Error');
        return;
    }

    const confirmar = await showGenericModal(
        `¿Desea eliminar el movimiento del extintor ${mov.no} (${mov.tipo}) del ${mov.fecha}?`,
        'Confirmar eliminación',
        'Eliminar',
        'Cancelar'
    );

    if (!confirmar) return;

    try {
        const { error } = await supabaseClient
            .from(TABLA_MOVIMIENTOS)
            .delete()
            .eq('id', mov.id);

        if (error) {
            console.error('Error eliminando movimiento:', error);
            await showGenericModal('Error al eliminar el movimiento: ' + error.message, 'Error');
            return;
        }

        historialCompleto.splice(index, 1);

        const { data: movimientosActivosDB } = await supabaseClient
            .from(TABLA_MOVIMIENTOS)
            .select('*')
            .eq('n_extintor', mov.no)
            .eq('activo', true)
            .in('tipo', ['prestamo_interno', 'prestamo_unidad', 'garantia']);

        if (movimientosActivosDB && movimientosActivosDB.length > 0) {
            await cargarMovimientosActivos();
        } else {
            delete movimientosPrestamoActivos[mov.no];
            delete movimientosGarantiaActivos[mov.no];
            delete movimientosActivos[mov.no];

            const { data: extintor } = await supabaseClient
                .from(TABLA_EXTINTORES)
                .select('*')
                .eq('N', mov.no)
                .single();

            if (extintor && (extintor.ubicacion_prestamo || extintor.ESTADO === 'Prestado' || extintor.ESTADO === 'Almacén SST')) {
                await supabaseClient
                    .from(TABLA_EXTINTORES)
                    .update({
                        ubicacion_prestamo: null,
                        ESTADO: null
                    })
                    .eq('N', mov.no);

                await actualizarUnExtintor(mov.no);
            }
        }

        renderizarHistorial();
        applyFilters();

        await showGenericModal('Movimiento eliminado correctamente.', 'Éxito');

    } catch (err) {
        console.error('Error inesperado:', err);
        await showGenericModal('Error inesperado: ' + err.message, 'Error');
    }
}

function verObservacionesGenerales() {
    renderizarListaObservacionesGenerales();
    observationsModal.classList.add('active');
}

function renderizarListaObservacionesGenerales() {
    const obsBody = document.getElementById('observations-body');
    obsBody.innerHTML = '';
    if (observacionesPublicas.length === 0) {
        obsBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No hay observaciones registradas.</td></tr>`;
        return;
    }
    observacionesPublicas.forEach((o, index) => {
        obsBody.innerHTML += `
            <tr>
                <td>${o.fecha}</td>
                <td><strong>${o.no}</strong></td>
                <td>${o.texto}</td>
                <td><button onclick="eliminarObservacion(${index})" style="background:#ef4444; color:white; border:none; padding:4px 12px; border-radius:8px; cursor:pointer; font-size:0.75rem; font-weight:600;"><i class="fas fa-trash-alt"></i></button></td>
            </tr>
        `;
    });
}

function abrirFormularioObservacion(itemIndex) {
    const item = misDatos[itemIndex];
    closeModal();
    document.getElementById('obs-extintor-no').value = item["N"];
    document.getElementById('obs-texto-detalle').value = '';
    observationFormModal.classList.add('active');
}
function closeObservationFormModal() { observationFormModal.classList.remove('active'); }

async function guardarObservacionPublica() {
    const no = document.getElementById('obs-extintor-no').value.trim();
    const texto = document.getElementById('obs-texto-detalle').value.trim();
    if (!texto) { await showGenericModal('Por favor escriba una observación.', 'Aviso'); return; }
    const { data, error } = await supabaseClient.from(TABLA_OBSERVACIONES).insert({ n_extintor: no, texto: texto }).select().single();
    if (error) { console.error(error); await showGenericModal('No se pudo guardar: ' + error.message, 'Error'); return; }
    observacionesPublicas.push({ id: data.id, no: data.n_extintor, texto: data.texto, fecha: new Date(data.created_at).toLocaleDateString('es-ES') });
    closeObservationFormModal();
    await showGenericModal('¡Observación registrada!', 'Éxito');
    renderizarListaObservacionesGenerales();
}

async function eliminarObservacion(index) {
    const o = observacionesPublicas[index];

    const confirmar = await showGenericModal(
        '¿Desea eliminar esta observación?',
        'Confirmar',
        'Sí',
        'No'
    );

    if (!confirmar) return;

    try {
        const { error } = await supabaseClient
            .from(TABLA_OBSERVACIONES)
            .delete()
            .eq('id', o.id);

        if (error) {
            console.error(error);
            await showGenericModal('No se pudo eliminar: ' + error.message, 'Error');
            return;
        }

        observacionesPublicas.splice(index, 1);
        renderizarListaObservacionesGenerales();

        await showGenericModal('Observación eliminada correctamente.', 'Éxito');

    } catch (err) {
        console.error('Error inesperado:', err);
        await showGenericModal('Error inesperado: ' + err.message, 'Error');
    }
}
function closeHistoryModal() { historyModal.classList.remove('active'); }
function closeObservationsModal() { observationsModal.classList.remove('active'); }

// ============================================================
//  EXPORTAR EXCEL
// ============================================================
function exportarExcel() {
    let datosAExportar = currentFilteredData.length > 0 ? currentFilteredData : misDatos;
    const todasLasClaves = [...new Set(misDatos.flatMap(obj => Object.keys(obj)))];
    if (!todasLasClaves.includes('evidencia')) todasLasClaves.push('evidencia');
    let html = `<h3 style="color:#10b981;">Inventario Principal de Extintores</h3><table border="1" style="font-size:12px;"><thead><tr style="background:#0f172a;color:#fff;">${todasLasClaves.map(c => `<th>${c}</th>`).join('')}<th>Condición Actual</th><th>Estado Actual</th><th>Garantía</th></tr></thead><tbody>`;
    datosAExportar.forEach(item => {
        html += `<tr>`;
        todasLasClaves.forEach(c => { let val = item[c] || "-"; if (c === 'evidencia' && val !== "-" && val.trim() !== "") { val = `<a href="${val}" target="_blank">Certificado de descarte</a>`; } html += `<td>${val}</td>`; });
        html += `<td>${escapeCondicion(getCondicionItem(item))}</td><td>${getEstadoItem(item)}</td><td>${getGarantiaReemplazo(item)}</td></tr>`;
    });
    html += `</tbody></table><br><br>`;
    html += `<h3 style="color:#0ea5e9;">Reporte General de Observaciones</h3><table border="1" style="font-size:12px;"><thead><tr style="background:#0f172a;color:#fff;"><th>Fecha</th><th>N Extintor</th><th>Observación</th></tr></thead><tbody>`;
    if (observacionesPublicas.length === 0) html += `<tr><td colspan="3" style="text-align:center;">No hay observaciones.</td></tr>`;
    else observacionesPublicas.forEach(o => { html += `<tr><td>${limpiar(o.fecha)}</td><td>${limpiar(o.no)}</td><td>${limpiar(o.texto)}</td></tr>`; });
    html += `</tbody></table><br><br>`;
    html += `<h3 style="color:#3b82f6;">Historial de Movimientos</h3><table border="1" style="font-size:12px;"><thead><tr style="background:#0f172a;color:#fff;"><th>Fecha</th><th>N Extintor</th><th>Tipo</th><th>Personal</th><th>Detalle</th></tr></thead><tbody>`;
    if (historialCompleto.length === 0) html += `<tr><td colspan="5" style="text-align:center;">No hay movimientos.</td></tr>`;
    else historialCompleto.forEach(m => { html += `<tr><td>${limpiar(m.fecha)}</td><td>${limpiar(m.no)}</td><td>${limpiar(m.tipo)}</td><td>${limpiar(m.personal)}</td><td>${limpiar(m.detalle)}</td></tr>`; });
    html += `</tbody></table>`;
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_General_Extintores_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================
//  MODAL DETALLES
// ============================================================
function showModal(item) {
    const modalBody = document.getElementById('modal-body');
    const modalActions = document.getElementById('modal-actions');
    const condicion = getCondicionItem(item);
    const estado = getEstadoItem(item);
    const no = String(item["N"]);
    const prestamoActivo = movimientosPrestamoActivos[no];
    const garantiaActiva = movimientosGarantiaActivos[no];

    const ubicacionAsignada = getUbicacionAsignada(item, isAdmin);
    const ubicacionActual = (item["ubicacion_prestamo"] && item["ubicacion_prestamo"].trim() !== "")
        ? item["ubicacion_prestamo"]
        : "-";

    const evidencia = item["evidencia"] || "";
    const evidenciaHTML = evidencia.trim() ? `<div class="modal-row"><label>Evidencia baja:</label><value><a href="${evidencia}" target="_blank" style="color:#3b82f6;text-decoration:underline;">Certificado de descarte</a></value></div>` : "";

    let movimientoHTML = '';
    if (prestamoActivo) {
        const tipoTexto = prestamoActivo.tipo === 'prestamo_unidad' ? 'Préstamo a Ubicación/Unidad' : 'Préstamo Interno';
        movimientoHTML += `
            <div class="modal-section" style="background:#fefce8;border:1px solid #fef08a;padding:14px;border-radius:12px;margin-top:8px;">
                <div class="modal-section-title" style="color:#854d0e;"><i class="fas fa-exchange-alt"></i> Préstamo Activo</div>
                <div class="modal-row"><label>Tipo:</label><value><strong>${tipoTexto}</strong></value></div>
                ${prestamoActivo.personal ? `<div class="modal-row"><label>Personal a cargo:</label><value><strong>${limpiar(prestamoActivo.personal)}</strong></value></div>` : ''}
                ${prestamoActivo.motivo ? `<div class="modal-row"><label>Motivo:</label><value><strong>${limpiar(prestamoActivo.motivo)}</strong></value></div>` : ''}
                ${prestamoActivo.reemplazo ? `<div class="modal-row"><label>Extintor reemplazo:</label><value><strong>${limpiar(prestamoActivo.reemplazo)}</strong></value></div>` : ''}
                ${prestamoActivo.responsable_destino ? `<div class="modal-row"><label>Responsable destino:</label><value><strong>${limpiar(prestamoActivo.responsable_destino)}</strong></value></div>` : ''}
                ${prestamoActivo.ubicacion_destino ? `<div class="modal-row"><label>Ubicación destino:</label><value><strong>${limpiar(prestamoActivo.ubicacion_destino)}</strong></value></div>` : ''}
                <div class="modal-row"><label>Fecha de Registro:</label><value>${limpiar(prestamoActivo.fecha)}</value></div>
            </div>`;
    }
    if (garantiaActiva) {
        movimientoHTML += `
            <div class="modal-section" style="background:#dbeafe;border:1px solid #93c5fd;padding:14px;border-radius:12px;margin-top:8px;">
                <div class="modal-section-title" style="color:#1e40af;"><i class="fas fa-tools"></i> Garantía Activa</div>
                ${garantiaActiva.personal ? `<div class="modal-row"><label>Personal a cargo:</label><value><strong>${limpiar(garantiaActiva.personal)}</strong></value></div>` : ''}
                ${garantiaActiva.reemplazo ? `<div class="modal-row"><label>Extintor reemplazo:</label><value><strong>${limpiar(garantiaActiva.reemplazo)}</strong></value></div>` : ''}
                <div class="modal-row"><label>Fecha de Registro:</label><value>${limpiar(garantiaActiva.fecha)}</value></div>
            </div>`;
    }

    modalBody.innerHTML = `
        <div class="modal-section"><div class="modal-section-title"><i class="fas fa-info-circle"></i> Información General</div>
            <div class="modal-row"><label>N Extintor:</label><value><strong>${limpiar(item["N"])}</strong></value></div>
            <div class="modal-row"><label>N Serie Actual:</label><value>${limpiar(item["N SERIE ACTUAL"])}</value></div>
            <div class="modal-row"><label>Tipo:</label><value>${limpiar(item["TIPO"])}</value></div>
            <div class="modal-row"><label>Capacidad:</label><value>${limpiar(item["CAP."])}</value></div>
        </div>
        <div class="modal-section"><div class="modal-section-title"><i class="fas fa-map-pin"></i> Ubicación</div>
            <div class="modal-row"><label>Responsable:</label><value>${limpiar(item["AREA RESPONSABLE"])}</value></div>
            <div class="modal-row"><label>Ubicación asignada:</label><value>${ubicacionAsignada}</value></div>
            <div class="modal-row"><label>Ubicación actual:</label><value>${ubicacionActual}</value></div>
        </div>
        <div class="modal-section"><div class="modal-section-title"><i class="fas fa-tag"></i> Condición y Estado</div>
            <div class="modal-row"><label>Condición:</label><value><span class="badge ${getBadgeClass(condicion)}">${escapeCondicion(condicion)}</span></value></div>
            ${isAdmin ? `<div class="modal-row"><label>Estado:</label><value>${estado ? `<span class="badge ${getEstadoBadgeClass(estado)}">${estado}</span>` : ""}</value></div>` : ''}
            ${evidenciaHTML}
            <div class="modal-row"><label>Vencimiento PH:</label><value>${formatMonthYear(item["ph_vencimiento"])}</value></div>
            <div class="modal-row"><label>Vencimiento recarga:</label><value>${formatMonthYear(item["F. VENC."])}</value></div>
${item["proxima_recarga"] && String(item["proxima_recarga"]).trim() !== "" ? `<div class="modal-row"><label>Próxima recarga:</label><value><strong style="color:#0ea5e9;">${formatMonthYear(item["proxima_recarga"])}</strong></value></div>` : ''}
        </div>
        ${movimientoHTML}`;

    let botonesAccion = '';
    if (!isAdmin) {
        botonesAccion += `<button class="btn btn-primary" style="background:#059669;color:white;" onclick="abrirFormularioObservacion(${currentItemIndex})"><i class="fas fa-pen"></i> Registrar Observación</button>`;
    }
    const esBaja = (item["CONDICION"] === "Baja");
if (isAdmin) {
    if (esBaja) {
        botonesAccion += `<button class="btn btn-success" onclick="abrirNuevoExtintor()"><i class="fas fa-plus"></i> Registrar nuevo extintor</button>`;
    } else {
        if (!garantiaActiva) {
            botonesAccion += `<button class="btn btn-primary" onclick="openLoanForm(${currentItemIndex})"><i class="fas fa-exchange-alt"></i> Registrar movimiento</button>`;
        }
        if (prestamoActivo) {
            botonesAccion += `<button class="btn btn-primary" onclick="finalizarPrestamo(${currentItemIndex})"><i class="fas fa-check-circle"></i> Finalizar Préstamo</button>`;
        }
        if (garantiaActiva) {
            const areaResponsable = item["AREA RESPONSABLE"] || "";
            const esAreaPendiente = requierePendiente(areaResponsable);
            const estadoPendiente = item["ESTADO"] === 'Extintor pendiente';
            const puedeFinalizar = !esAreaPendiente || !estadoPendiente;
            if (estadoPendiente) {
                botonesAccion += `<button class="btn btn-warning" onclick="marcarGarantiaRecibida(${currentItemIndex})"><i class="fas fa-truck"></i> Confirmar llegada a mantenimiento</button>`;
            }
            if (puedeFinalizar) {
                botonesAccion += `<button class="btn btn-success" onclick="finalizarGarantia(${currentItemIndex})"><i class="fas fa-check-circle"></i> Finalizar Garantía</button>`;
            }
        }
        botonesAccion += `<button class="btn" style="background:#7c3aed;color:white;" onclick="abrirEditor(${currentItemIndex})"><i class="fas fa-edit"></i> Editar registro</button>`;
    }
}
botonesAccion += `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`;
modalActions.innerHTML = botonesAccion;
detailModal.classList.add('active');
}
function closeModal() { detailModal.classList.remove('active'); }

// ============================================================
//  PRÉSTAMO Y FUNCIONES RELACIONADAS
// ============================================================
function openLoanForm(itemIndex) {
currentItemIndex = itemIndex;
closeModal();

// ✅ NUEVO: Si hay préstamo activo, solo permitir "garantia"
const item = misDatos[itemIndex];
const no = String(item["N"]);
const tienePrestamoActivo = !!movimientosPrestamoActivos[no];
const tipoSelect = document.getElementById('tipo-prestamo');

// Limpiar todos los campos
 document.getElementById('personal-cambio').value = '';
    document.getElementById('extintor-reemplazo').value = '';
    document.getElementById('motivo-select').value = 'Usado';
    document.getElementById('proxima-recarga').value = '';
    
    document.getElementById('garantia-personal').value = '';
    document.getElementById('garantia-reemplazo').value = '';
    
    document.getElementById('unidad-area').value = '';
    document.getElementById('unidad-responsable').value = '';
    document.getElementById('unidad-asignada').value = '';
    document.getElementById('unidad-reemplazo').value = '';
    
    document.getElementById('traslado-motivo').value = 'Usado';
    document.getElementById('traslado-personal').value = '';
    document.getElementById('traslado-proxima-recarga').value = '';

     if (unidadAreaAutocomplete) unidadAreaAutocomplete.refrescar();
 
 // ✅ NUEVO: Si hay préstamo activo, forzar "garantia" y deshabilitar otras opciones
 if (tienePrestamoActivo) {
     tipoSelect.value = 'garantia';
     // Deshabilitar opciones que no sean garantía
     Array.from(tipoSelect.options).forEach(opt => {
         if (opt.value !== 'garantia') {
             opt.disabled = true;
         }
     });
 } else {
     tipoSelect.value = 'unidad';
     // Habilitar todas las opciones
     Array.from(tipoSelect.options).forEach(opt => {
         opt.disabled = false;
     });
 }
 
 toggleCamposPrestamo();
 loanModal.classList.add('active');
}

function closeLoanModal() {
    loanModal.classList.remove('active');
}

async function confirmarTrasladoAlmacen() {
    const item = misDatos[currentItemIndex];
    const no = String(item["N"]);
    const motivo = document.getElementById('traslado-motivo').value;
    const personal = document.getElementById('traslado-personal').value.trim();
    const proximaRecarga = document.getElementById('traslado-proxima-recarga').value.trim();

    if (!personal) {
        await showGenericModal('Por favor ingrese el personal a cargo.', 'Aviso');
        return;
    }
    if (proximaRecarga && !getMonthYear(proximaRecarga)) {
        await showGenericModal('Formato de fecha inválido. Use MM/AAAA (ej. 03/2028).', 'Aviso');
        return;
    }

    const btn = loanModal.querySelector('.modal-actions .btn-primary');
    const txtOrig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const fechaOriginal = item["F. VENC."] || "-";
        const updateData = {
            ubicacion_prestamo: 'Mantenimiento / Almacén SST',
            CONDICION: motivo,
            ESTADO: 'Almacén SST',
            observaciones: (item["observaciones"] || '') + `\n[Traslado Almacén ${new Date().toLocaleDateString('es-ES')}] Motivo: ${motivo} - Vencía: ${fechaOriginal}${proximaRecarga ? ' → Próx. recarga: ' + proximaRecarga : ''}`
        };
        if (proximaRecarga) updateData.proxima_recarga = proximaRecarga;

        const { error: updError } = await supabaseClient.from(TABLA_EXTINTORES).update(updateData).eq('N', no);
        if (updError) throw updError;

        const detalle = `Traslado a Almacén - Motivo: ${motivo} - Personal: ${personal}${proximaRecarga ? ' - Próx. recarga: ' + proximaRecarga : ''}`;
        const { data: movData, error: movError } = await supabaseClient.from(TABLA_MOVIMIENTOS).insert({
            n_extintor: no,
            tipo: 'prestamo_interno', 
            personal: personal,
            motivo: motivo,
            reemplazo: null, 
            responsable_destino: 'SST',
            ubicacion_destino: 'Mantenimiento / Almacén SST',
            detalle: detalle,
            activo: true
        }).select().single();

        if (movError) throw movError;

        await actualizarUnExtintor(no);
        await cargarMovimientosActivos();

        historialCompleto.unshift({
            id: movData.id,
            fecha: new Date().toLocaleString('es-ES'),
            no: no,
            tipo: 'Traslado a Almacén',
            personal: personal,
            detalle: detalle
        });

        closeLoanModal();
        applyFilters();
        await showGenericModal('Extintor trasladado al almacén correctamente.', 'Éxito');

    } catch (err) {
        console.error(err);
        await showGenericModal('Error al trasladar: ' + err.message, 'Error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOrig;
    }
}
function toggleCamposPrestamo() {
    const tipo = document.getElementById('tipo-prestamo').value;
    document.getElementById('campos-interno').style.display = 'none';
    document.getElementById('campos-garantia').style.display = tipo === 'garantia' ? 'block' : 'none';
    document.getElementById('campos-unidad').style.display = tipo === 'unidad' ? 'block' : 'none';
    document.getElementById('campos-traslado').style.display = tipo === 'traslado' ? 'block' : 'none';
}

async function guardarPrestamo() {
    const tipo = document.getElementById('tipo-prestamo').value;
    if (tipo === 'interno') await guardarPrestamoInterno();
    else if (tipo === 'garantia') await guardarPrestamoGarantia();
    else if (tipo === 'unidad') await guardarPrestamoUnidad();
    else if (tipo === 'traslado') await confirmarTrasladoAlmacen();
}
async function guardarPrestamoInterno() {
    const personal = document.getElementById('personal-cambio').value.trim();
    const reemplazo = document.getElementById('extintor-reemplazo').value.trim();
    const motivo = document.getElementById('motivo-select').value;
    const proximaRecarga = document.getElementById('proxima-recarga').value.trim();

    if (!personal || !reemplazo) {
        await showGenericModal('Por favor complete todos los campos.', 'Aviso');
        return;
    }
    if (!proximaRecarga) {
        await showGenericModal('Por favor ingrese la próxima fecha de recarga (MM/AAAA).', 'Aviso');
        return;
    }
    if (!getMonthYear(proximaRecarga)) {
        await showGenericModal('Formato de fecha inválido. Use MM/AAAA (ej. 03/2028).', 'Aviso');
        return;
    }

    const itemA = misDatos[currentItemIndex];
    const noA = String(itemA["N"]);

    const estadoActual = itemA["ESTADO"] || "";
    if (estadoActual === "Prestado" || estadoActual === "Almacén SST") {
        await showGenericModal('Este extintor ya tiene un préstamo activo.', 'Error');
        return;
    }

    const { data: itemBData, error: searchError } = await supabaseClient
        .from(TABLA_EXTINTORES)
        .select('*')
        .eq('N', reemplazo)
        .single();

    if (searchError || !itemBData) {
        await showGenericModal('No se encontró el extintor de reemplazo en el inventario.', 'Error');
        return;
    }

    const noB = String(itemBData["N"]);

    if (noB === noA) {
        await showGenericModal('El extintor de reemplazo no puede ser el mismo que se reporta.', 'Error');
        return;
    }

    const estadoB = String(itemBData["ESTADO"] || "").trim();
    const condicionB = String(itemBData["CONDICION"] || "").trim();
    const ESTADOS_NO_DISPONIBLES = ['Prestado', 'Almacén SST', 'Extintor pendiente', 'Garantía - Recibido'];

    if (condicionB === 'Baja' || condicionB === 'Reemplazado') {
        await showGenericModal(`El extintor N° ${noB} está dado de baja y no puede usarse como reemplazo.`, 'Error');
        return;
    }

    if (ESTADOS_NO_DISPONIBLES.includes(estadoB)) {
        await showGenericModal(`El extintor N° ${noB} no está disponible (estado: ${estadoB}). Elija otro reemplazo.`, 'Error');
        return;
    }

    const { data: movimientosB } = await supabaseClient
        .from(TABLA_MOVIMIENTOS)
        .select('tipo')
        .eq('n_extintor', noB)
        .eq('activo', true)
        .in('tipo', ['prestamo_interno', 'prestamo_unidad', 'garantia']);

    if (movimientosB && movimientosB.length > 0) {
        await showGenericModal(`El extintor N° ${noB} ya está involucrado en otro movimiento activo. Elija otro reemplazo.`, 'Error');
        return;
    }

    const responsableOriginalA = itemA["AREA RESPONSABLE"] || "Sin responsable";
    const fechaOriginal = itemA["F. VENC."] || "-";

    await supabaseClient
        .from(TABLA_EXTINTORES)
        .update({
            ubicacion_prestamo: 'Mantenimiento / Almacén SST',
            CONDICION: motivo,
            ESTADO: 'Almacén SST',
            proxima_recarga: proximaRecarga
        })
        .eq('N', noA);

    await supabaseClient
        .from(TABLA_EXTINTORES)
        .update({
            ubicacion_prestamo: `Préstamo a: ${responsableOriginalA} | Reemplaza al N ${noA}`,
            ESTADO: 'Prestado'
        })
        .eq('N', noB);

    const { data: movimientosInsertados, error: movInsertError } = await supabaseClient
    .from(TABLA_MOVIMIENTOS)
    .insert([
        {
            n_extintor: noA,
            tipo: 'prestamo_interno',
            personal: personal,
            motivo: motivo,
            reemplazo: noB,
            responsable_destino: "SST",
            ubicacion_destino: 'Mantenimiento / Almacén SST',
            detalle: `Extintor ${noA} reportado como ${motivo} - Vencía: ${fechaOriginal} → Próxima recarga: ${proximaRecarga} - Reemplazado por ${noB}`,
            activo: true
        },
        {
            n_extintor: noB,
            tipo: 'prestamo_interno',
            personal: personal,
            motivo: motivo,
            reemplazo: noA,
            responsable_destino: responsableOriginalA,
            ubicacion_destino: `Préstamo a: ${responsableOriginalA} | Reemplaza al N ${noA}`,
            detalle: `Extintor ${noB} (STOCK) enviado a ${responsableOriginalA} - Reemplaza a ${noA}`,
            activo: true
        }
    ])
    .select();

if (movInsertError) {
    console.error('Error insertando movimientos:', movInsertError);
    await showGenericModal('Error al registrar el préstamo: ' + movInsertError.message, 'Error');
    return;
}

    await supabaseClient
        .from(TABLA_EXTINTORES)
        .update({
            observaciones: (itemA["observaciones"] || '') + `\n[Préstamo Interno ${new Date().toLocaleDateString('es-ES')}] ${motivo} - Vencía: ${fechaOriginal} → Próxima recarga: ${proximaRecarga}`
        })
        .eq('N', noA);

    await actualizarUnExtintor(noA);
    await actualizarUnExtintor(noB);
    await cargarMovimientosActivos();

    if (movimientosInsertados && movimientosInsertados.length === 2) {
    historialCompleto.push(
        {
            id: movimientosInsertados[0].id,
            fecha: new Date().toLocaleString('es-ES'),
            no: noA,
            tipo: 'Préstamo Interno (Salida)',
            personal: personal,
            detalle: `Extintor ${noA} reportado como ${motivo} - Vencía: ${fechaOriginal} → Próxima recarga: ${proximaRecarga} - Reemplazado por ${noB}`
        },
        {
            id: movimientosInsertados[1].id,
            fecha: new Date().toLocaleString('es-ES'),
            no: noB,
            tipo: 'Préstamo Interno (Entrada)',
            personal: personal,
            detalle: `Extintor ${noB} (STOCK) enviado a ${responsableOriginalA} - Reemplaza a ${noA}`
        }
    );
}

    await showGenericModal('Préstamo interno registrado exitosamente.', 'Éxito');
    closeLoanModal();
    applyFilters();
}

async function guardarPrestamoGarantia() {
    const personal = document.getElementById('garantia-personal').value.trim();
    const reemplazo = document.getElementById('garantia-reemplazo').value.trim();
    if (!personal || !reemplazo) {
        await showGenericModal('Por favor complete todos los campos.', 'Aviso');
        return;
    }
    const item = misDatos[currentItemIndex];
    const no = String(item["N"]);

    if (movimientosGarantiaActivos[no]) {
        await showGenericModal('Este extintor ya tiene una garantía activa.', 'Error');
        return;
    }
    const areaResponsable = item["AREA RESPONSABLE"] || "";
    const debePonerPendiente = requierePendiente(areaResponsable);
    const tienePrestamoActivo = !!movimientosPrestamoActivos[no];
    
    const btns = loanModal.querySelectorAll('.modal-actions .btn');
    const saveBtn = btns[0];
    const textoOriginal = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const detalle = `Garantía - Personal: ${personal} - Extintor reemplazo: ${reemplazo}`;
        const fecha = new Date().toLocaleString('es-ES');

      const updateEstado = debePonerPendiente && !tienePrestamoActivo
         ? { ESTADO: 'Extintor pendiente' }
        : {};

        const [movRes, updRes] = await Promise.all([
            supabaseClient
                .from(TABLA_MOVIMIENTOS)
                .insert({
                    n_extintor: no,
                    tipo: 'garantia',
                    personal: personal,
                    reemplazo: reemplazo,
                    detalle: detalle,
                    activo: true
                })
                .select()
                .single(),
            supabaseClient
                .from(TABLA_EXTINTORES)
                .update(updateEstado)
                .eq('N', no)
        ]);

        if (movRes.error) throw movRes.error;
        if (updRes.error) throw updRes.error;

        const movInsertado = movRes.data;

        const idxEstado = misDatos.findIndex(it => String(it["N"]) === no);
        if (idxEstado !== -1) {
            misDatos[idxEstado] = { ...misDatos[idxEstado], ...updateEstado };
        }
        movimientosGarantiaActivos[no] = {
            reemplazo: reemplazo,
            personal: personal,
            fecha: fecha
        };
        if (!movimientosPrestamoActivos[no]) {
            movimientosActivos[no] = movimientosGarantiaActivos[no];
        }

        historialCompleto.unshift({
            id: movInsertado ? movInsertado.id : undefined,
            fecha: fecha,
            no: no,
            tipo: 'garantia',
            personal: personal,
            detalle: detalle
        });

        closeLoanModal();
        applyFilters();

        await showGenericModal('Garantía registrada correctamente.', 'Éxito');

    } catch (err) {
        console.error(err);
        await showGenericModal('Error al registrar la garantía: ' + (err.message || err), 'Error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = textoOriginal;
    }
}

async function marcarGarantiaRecibida(itemIndex) {
    if (!isAdmin) return;
    const item = misDatos[itemIndex];
    if (!item) return;
    const no = String(item["N"]);

    if (!movimientosGarantiaActivos[no]) {
        await showGenericModal('Este extintor no tiene una garantía activa.', 'Aviso');
        return;
    }
    if (item["ESTADO"] === 'Garantía - Recibido' || item["ESTADO"] === 'Retorno - Recibido') {
        await showGenericModal('Este extintor ya fue marcado como recibido.', 'Aviso');
        return;
    }

    const confirmar = await showGenericModal(
        `¿Confirmar que el extintor N° ${no} fue retirado del área y traído a almacén?`,
        'Confirmar retorno del original',
        'Sí, recibido',
        'Cancelar'
    );
    if (!confirmar) return;

    const allBtns = document.querySelectorAll('.modal.active .modal-actions .btn');
    allBtns.forEach(b => b.disabled = true);

    try {
    const fecha = new Date().toLocaleString('es-ES');
    
    // ✅ NUEVO: Solo cambiar estado si NO hay préstamo activo
    const tienePrestamoActivo = !!movimientosPrestamoActivos[no];
    const updateData = tienePrestamoActivo 
        ? {}  // No tocar el estado si tiene préstamo activo
        : { ESTADO: 'Garantía - Recibido' };
    
    const [updateRes, insertRes] = await Promise.all([
        // Solo hacer update si hay cambios
        Object.keys(updateData).length > 0
            ? supabaseClient.from(TABLA_EXTINTORES).update(updateData).eq('N', no)
            : Promise.resolve({ error: null }),
            supabaseClient.from(TABLA_MOVIMIENTOS).insert({
                n_extintor: no,
                tipo: 'garantia_retiro',
                personal: 'Sistema',
                detalle: `Extintor ${no} retirado del área y traído a almacén`,
                activo: false
            }).select().single()
        ]);

        if (updateRes.error) throw updateRes.error;

        const movInsertado = insertRes.data;
        const idx = misDatos.findIndex(it => String(it["N"]) === no);
       // ✅ NUEVO: Solo actualizar misDatos si hubo cambios en el estado
       if (idx !== -1 && Object.keys(updateData).length > 0) {
       misDatos[idx] = { ...misDatos[idx], ...updateData };
        }

        historialCompleto.unshift({
            id: movInsertado?.id,
            fecha: fecha,
            no: no,
            tipo: 'Garantía - Retiro',
            personal: 'Sistema',
            detalle: `Extintor ${no} retirado del área`
        });

        closeModal();
        applyFilters();
        await showGenericModal('Retorno confirmado correctamente.', 'Éxito');

    } catch (err) {
        console.error(err);
        await showGenericModal('Error: ' + (err.message || err), 'Error');

    } finally {
        allBtns.forEach(b => b.disabled = false);
    }
}

async function guardarPrestamoUnidad() {
    const area = document.getElementById('unidad-area').value.trim();
    const responsable = document.getElementById('unidad-responsable').value.trim();
    const unidad = document.getElementById('unidad-asignada').value.trim();
    const reemplazo = document.getElementById('unidad-reemplazo').value.trim(); // ✅ NUEVO
    
    if (!area || !responsable || !unidad) {
        await showGenericModal('Por favor complete todos los campos (Área, Responsable y Ubicación/unidad asignada).', 'Aviso');
        return;
    }
    
    const item = misDatos[currentItemIndex];
    const no = String(item["N"]);
    const estadoActual = item["ESTADO"] || "";
    if (estadoActual === "Prestado" || estadoActual === "Almacén SST") {
        await showGenericModal('Este extintor ya tiene un préstamo activo.', 'Error');
        return;
    }
    
    const btns = loanModal.querySelectorAll('.modal-actions .btn');
    const saveBtn = btns[0];
    const textoOriginal = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    const fecha = new Date().toLocaleString('es-ES');
    const ubicacionTexto = unidad;
    const detalle = `Préstamo a unidad - Área: ${area} - Responsable: ${responsable} - Unidad: ${unidad}${reemplazo ? ' - Reemplazo: N° ' + reemplazo : ''}`;
    
    try {
        const [updateRes, insertRes] = await Promise.all([
            supabaseClient
                .from(TABLA_EXTINTORES)
                .update({ ubicacion_prestamo: ubicacionTexto, ESTADO: 'Prestado' })
                .eq('N', no),
            supabaseClient
                .from(TABLA_MOVIMIENTOS)
                .insert({
                    n_extintor: no,
                    tipo: 'prestamo_unidad',
                    personal: responsable,
                    responsable_destino: area,
                    ubicacion_destino: unidad,
                    reemplazo: reemplazo || null, // ✅ NUEVO: se guarda el reemplazo
                    detalle: detalle,
                    activo: true
                })
                .select()
                .single()
        ]);
        
        if (updateRes.error) throw new Error('Error al actualizar el extintor: ' + updateRes.error.message);
        if (insertRes.error) throw new Error('Error al registrar el movimiento: ' + insertRes.error.message);
        
        const movInsertado = insertRes.data;
        const idx = misDatos.findIndex(it => String(it["N"]) === no);
        if (idx !== -1) {
            misDatos[idx] = {
                ...misDatos[idx],
                ubicacion_prestamo: ubicacionTexto,
                ESTADO: 'Prestado'
            };
        }
        
        movimientosPrestamoActivos[no] = {
            tipo: 'prestamo_unidad',
            personal: responsable,
            motivo: null,
            reemplazo: reemplazo || null, // ✅ NUEVO
            responsable_destino: area,
            ubicacion_destino: unidad,
            fecha: fecha
        };
        movimientosActivos[no] = movimientosPrestamoActivos[no];
        
        historialCompleto.unshift({
            id: movInsertado ? movInsertado.id : undefined,
            fecha: fecha,
            no: no,
            tipo: 'prestamo_unidad',
            personal: responsable,
            detalle: detalle
        });
        
        // ✅ Limpiar el nuevo campo al cerrar
        document.getElementById('unidad-reemplazo').value = '';
        
        closeLoanModal();
        applyFilters();
        await showGenericModal('Préstamo a unidad registrado correctamente.', 'Éxito');
    } catch (err) {
        console.error(err);
        await showGenericModal(err.message || 'Error inesperado al registrar el préstamo.', 'Error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = textoOriginal;
    }
}

// ============================================================
//  FINALIZAR GARANTÍA Y PRÉSTAMO
// ============================================================
function getGarantiasPendientes() {
    return misDatos.filter(item =>
        (item["ESTADO"] || "") === "Extintor pendiente" &&
        movimientosGarantiaActivos[String(item["N"])]
    );
}

function actualizarAlertaGarantias() {
    const alert = document.getElementById('garantia-alert');
    if (!alert) return;
    if (!isAdmin) { alert.style.display = 'none'; return; }

    const count = getGarantiasPendientes().length;
    document.getElementById('garantia-pending-count').textContent = count;
    alert.style.display = count > 0 ? 'flex' : 'none';
}

function verGarantiasPendientes() {
    const pendientes = getGarantiasPendientes();
    const body = document.getElementById('garantias-pendientes-body');
    body.innerHTML = '';

    if (pendientes.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">No hay garantías pendientes de retiro.</td></tr>`;
    } else {
        pendientes.forEach(item => {
            const no = String(item["N"]);
            const g = movimientosGarantiaActivos[no] || {};
            const idx = misDatos.indexOf(item);
            body.innerHTML += `
                <tr>
                    <td><strong>${no}</strong></td>
                    <td>${item["AREA RESPONSABLE"] || '-'}</td>
                    <td>${g.reemplazo || '-'}</td>
                    <td>${g.personal || '-'}</td>
                    <td>${g.fecha || '-'}</td>
                    <td>
                        <button class="btn btn-warning" style="padding:6px 12px; font-size:0.8rem;"
                            onclick="closeGarantiasPendientesModal(); marcarGarantiaRecibida(${idx});">
                            <i class="fas fa-truck"></i> Recibido
                        </button>
                    </td>
                </tr>`;
        });
    }
    document.getElementById('garantias-pendientes-modal').classList.add('active');
}

function closeGarantiasPendientesModal() {
    document.getElementById('garantias-pendientes-modal').classList.remove('active');
}

async function finalizarGarantia(itemIndex) {
    const item = misDatos[itemIndex];
    const no = String(item["N"]);

    if (!movimientosGarantiaActivos[no]) {
        await showGenericModal('Este extintor no tiene una garantía activa.', 'Aviso');
        return;
    }

    const fechaIngresada = await showPromptModal(
        'Ingrese la nueva fecha de vencimiento (MM/AAAA). Ejemplo: 09/2027',
        'Nueva fecha de vencimiento',
        item["F. VENC."] || ''
    );
    if (fechaIngresada === null) return;
    const fechaLimpia = fechaIngresada.trim();
    if (!fechaLimpia) {
        await showGenericModal('Debe ingresar una fecha.', 'Aviso');
        return;
    }
    if (!getMonthYear(fechaLimpia)) {
        await showGenericModal('Formato inválido. Use MM/AAAA (ej. 09/2027).', 'Aviso');
        return;
    }

    const allBtns = detailModal.querySelectorAll('.modal-actions .btn');
    let saveBtn = null;
    let textoOriginal = '';
    allBtns.forEach(btn => {
        if (btn.innerText.includes('Finalizar Garantía')) {
            saveBtn = btn;
            textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';
        } else {
            btn.disabled = true;
        }
    });

    try {
    const nuevaFecha = fechaLimpia;
    
    // ✅ NUEVO: Si hay préstamo activo, solo actualizar F. VENC.
    // Si no hay préstamo, limpiar estado y próxima_recarga (comportamiento actual)
    const tienePrestamoActivo = !!movimientosPrestamoActivos[no];
    const updateData = tienePrestamoActivo
        ? { "F. VENC.": nuevaFecha }
        : { "F. VENC.": nuevaFecha, ESTADO: null, proxima_recarga: null };
    
    const [updateExtintor, desactivarMov] = await Promise.all([
        supabaseClient
            .from(TABLA_EXTINTORES)
            .update(updateData)
            .eq('N', no),
        supabaseClient
            .from(TABLA_MOVIMIENTOS)
            .update({ activo: false })
            .eq('n_extintor', no)
            .eq('tipo', 'garantia')
            .eq('activo', true)
    ]);

        if (updateExtintor.error) throw updateExtintor.error;
        if (desactivarMov.error) throw desactivarMov.error;

        await actualizarUnExtintor(no);
delete movimientosGarantiaActivos[no];

// ✅ NUEVO: Solo borrar movimientosActivos si NO hay préstamo activo
// Si hay préstamo, debe seguir vivo porque el préstamo sigue activo
if (!tienePrestamoActivo) {
    delete movimientosActivos[no];
}

const detalleHistorial = tienePrestamoActivo
    ? `Garantía finalizada - Nuevo vencimiento: ${nuevaFecha} (Préstamo a ubicación se mantiene activo)`
    : `Garantía finalizada - Nuevo vencimiento: ${nuevaFecha}`;

historialCompleto.push({
    fecha: new Date().toLocaleString('es-ES'),
    no: no,
    tipo: 'Garantía finalizada',
    personal: 'Sistema',
    detalle: detalleHistorial
});

        closeModal();
applyFilters();
const mensajeExito = tienePrestamoActivo
    ? `Garantía finalizada. Nuevo vencimiento: ${nuevaFecha}. El préstamo a ubicación/unidad se mantiene activo.`
    : `Garantía finalizada. Nuevo vencimiento: ${nuevaFecha}`;
await showGenericModal(mensajeExito, 'Éxito');

    } catch (err) {
        console.error(err);
        await showGenericModal('Error al finalizar la garantía: ' + (err.message || err), 'Error');
    } finally {
        allBtns.forEach(btn => btn.disabled = false);
        if (saveBtn && textoOriginal) saveBtn.innerHTML = textoOriginal;
    }
}

async function finalizarPrestamo(itemIndex) {
    const item = misDatos[itemIndex];
    const no = String(item["N"]);
    const prestamo = movimientosPrestamoActivos[no];

    if (!prestamo) {
        await showGenericModal('Este extintor no tiene un préstamo activo.', 'Aviso');
        return;
    }

    let nuevaFechaReal = null;
    const esPrestamoInterno = (prestamo.tipo === 'prestamo_interno');
    const noRelacionado = prestamo.reemplazo ? String(prestamo.reemplazo) : null;
    let noOriginal = no;

    if (esPrestamoInterno && noRelacionado) {
        const candidatos = [no, noRelacionado].filter(num => {
            const extintor = misDatos.find(x => String(x.N) === num);
            const movimiento = movimientosPrestamoActivos[num];
            const ubicacion = String(movimiento?.ubicacion_destino || extintor?.ubicacion_prestamo || '').trim().toLowerCase();
            return extintor && (extintor.ESTADO === 'Almacén SST' || ubicacion === 'mantenimiento / almacén sst');
        });
        if (candidatos.length !== 1) {
            await showGenericModal('No se pudo identificar el extintor enviado a mantenimiento. Revise los registros antes de finalizar el préstamo.', 'Aviso');
            return;
        }
        noOriginal = candidatos[0];
    }

    if (esPrestamoInterno) {
        const original = misDatos.find(x => String(x.N) === noOriginal);
        const fechaIngresada = await showPromptModal(
            `Ingrese la fecha de vencimiento del extintor N° ${noOriginal} (MM/AAAA).`,
            'Fecha real de recarga',
            original["F. VENC."] || ''
        );
        if (fechaIngresada === null) return;
        const fechaLimpia = fechaIngresada.trim();
        if (!fechaLimpia) {
            await showGenericModal('Debe ingresar una fecha.', 'Aviso');
            return;
        }
        if (!getMonthYear(fechaLimpia)) {
            await showGenericModal('Formato inválido. Use MM/AAAA (ej. 03/2028).', 'Aviso');
            return;
        }
        nuevaFechaReal = fechaLimpia;
    }

    const numerosAFinalizar = [no];
    if (noRelacionado) numerosAFinalizar.push(noRelacionado);

    for (const num of numerosAFinalizar) {
        const { error: movError } = await supabaseClient
            .from(TABLA_MOVIMIENTOS)
            .update({ activo: false })
            .eq('n_extintor', num)
            .in('tipo', ['prestamo_interno', 'prestamo_unidad'])
            .eq('activo', true);
        if (movError) {
            console.error(`Error desactivando préstamo para ${num}:`, movError);
            await showGenericModal('No se pudo finalizar el préstamo. Revise los registros antes de reintentar.', 'Error');
            return;
        }

        const updateData = {
            ubicacion_prestamo: null,
            ESTADO: null
        };
        if (num === (esPrestamoInterno ? noOriginal : no)) {
            updateData.proxima_recarga = null;
            // La condición con la que salió el extintor se borra al volver.
            const motivoMovimiento = String(movimientosPrestamoActivos[num]?.motivo || '').trim();
            const condicionActual = String((misDatos.find(x => String(x.N) === num) || {})["CONDICION"] || '').trim();
            if (motivoMovimiento && condicionActual && motivoMovimiento === condicionActual) {
                updateData.CONDICION = null;
            }
            if (nuevaFechaReal) {
                updateData["F. VENC."] = nuevaFechaReal;
            }
        }

        const { error: updateError } = await supabaseClient
            .from(TABLA_EXTINTORES)
            .update(updateData)
            .eq('N', num);
        if (updateError) {
            console.error(`Error actualizando extintor ${num}:`, updateError);
            await showGenericModal('No se pudo actualizar el extintor. Revise los registros antes de reintentar.', 'Error');
            return;
        }
    }

    for (const num of numerosAFinalizar) {
        await actualizarUnExtintor(num);
    }

    for (const num of numerosAFinalizar) {
        delete movimientosPrestamoActivos[num];
        delete movimientosActivos[num];
    }

    historialCompleto.push({
        fecha: new Date().toLocaleString('es-ES'),
        no: no,
        tipo: 'Retorno',
        personal: 'Sistema',
        detalle: `Préstamo finalizado${nuevaFechaReal ? ` - Nuevo vencimiento del extintor ${noOriginal}: ${nuevaFechaReal}` : ''}${noRelacionado ? ` - Extintor ${noRelacionado}` : ''}`
    });

    await showGenericModal('Préstamo finalizado correctamente.' + (nuevaFechaReal ? ` Nuevo vencimiento del extintor ${noOriginal}: ${nuevaFechaReal}` : ''), 'Éxito');
    closeModal();
    applyFilters();
}

// ============================================================
//  EDITOR, BAJA, NUEVO REEMPLAZO
// ============================================================
const nombresMostrar = {
    'N': 'Número de Extintor',
    'N SERIE ACTUAL': 'Número de Serie Actual',
    'TIPO': 'Tipo de Extintor',
    'CAP.': 'Capacidad',
    'costo_recarga': 'Costo de Recarga',
    'zona': 'Zona',
    'gerencia': 'Gerencia',
    'AREA RESPONSABLE': 'Área Responsable',
    'UBICACION': 'Ubicación Asignada',
    'ph_vencimiento': 'Vencimiento PH',
    'F. VENC.': 'Vencimiento de Recarga',
    'fecha_fabricacion': 'Fecha de Fabricación',
    'proveedor': 'Proveedor',
    'anterior_ubicacion': 'Anterior Ubicación',
    'vigencia_actual': 'Vigencia Actual',
    'ubicacion_prestamo': 'Ubicación Actual',
    'CONDICION': 'Condición',
    'ESTADO': 'Estado',
    'observaciones': 'Observaciones',
    'proxima_recarga': 'Próxima Recarga'
};
function abrirAgregarExtintor() {
    if (!isAdmin) return;
    currentItemIndex = null;
    extintorBajaOrigen = null;
    abrirNuevoExtintor();
}
function abrirNuevoExtintor() {
    if (!isAdmin) return;

    const itemBase = (currentItemIndex !== null && misDatos[currentItemIndex])
        ? misDatos[currentItemIndex]
        : {};

    extintorBajaOrigen = (itemBase['CONDICION'] === 'Baja')
        ? itemBase
        : null;

    editorModoCreacion = true;

    const camposBase = [
        'N', 'N SERIE ACTUAL', 'TIPO', 'CAP.', 'costo_recarga', 'zona', 'gerencia',
        'AREA RESPONSABLE', 'UBICACION', 'ph_vencimiento', 'F. VENC.', 'fecha_fabricacion',
        'proveedor', 'anterior_ubicacion', 'vigencia_actual', 'ubicacion_prestamo',
        'CONDICION', 'ESTADO', 'observaciones', 'proxima_recarga'
    ];

    const excluir = ['id', 'created_at', 'updated_at', 'evidencia'];
    const clavesItem = Object.keys(itemBase).filter(k => !excluir.includes(k));
    const clavesFinales = clavesItem.length > 0 ? clavesItem : camposBase;

    const titulo = extintorBajaOrigen
        ? `Registrar extintor de reemplazo del N° ${itemBase['N']}`
        : 'Agregar nuevo extintor';

    document.getElementById('editor-title').innerHTML =
        `<i class="fas fa-plus-circle" style="color:#16a34a;"></i> ${titulo}`;

    document.getElementById('editor-subtitle').textContent =
        extintorBajaOrigen
            ? `El nuevo extintor reemplazará al N° ${itemBase['N']} (dado de baja). Modifique lo necesario.`
            : 'Complete los datos del nuevo extintor antes de registrarlo.';

    const editorBody = document.getElementById('editor-body');
    editorBody.innerHTML = '';

    clavesFinales.forEach(clave => {
        const campo = document.createElement('div');
        campo.className = 'editor-field';

        const label = document.createElement('label');
        label.textContent = nombresMostrar[clave] || clave;

        const valorBase = itemBase[clave] ?? '';

        const input = String(valorBase).length > 70
            ? document.createElement('textarea')
            : document.createElement('input');

        input.dataset.key = clave;
        input.disabled = false;

        if (clave === 'N') {
            input.value = '';
            input.placeholder = extintorBajaOrigen
                ? `Nuevo N° (el anterior era ${valorBase})`
                : 'Ingrese el número del extintor';
            campo.style.border = '2px solid #f59e0b';
            campo.style.background = '#fffbeb';
            label.style.color = '#b45309';
            label.textContent = 'Número de Extintor (obligatorio)';
        } else if (clave === 'CONDICION') {
            input.value = 'Vigente';
        } else if (clave === 'ESTADO') {
            input.value = '';
        } else if (clave === 'ubicacion_prestamo') {
            input.value = '';
        } else if (clave === 'observaciones') {
            input.value = extintorBajaOrigen
                ? `Reemplazo del extintor dado de baja N° ${itemBase['N']}`
                : 'Creado manualmente desde el sistema.';
        } else if (extintorBajaOrigen) {
            input.value = String(valorBase);
        } else {
            input.value = '';
        }

        campo.appendChild(label);
        campo.appendChild(input);
        editorBody.appendChild(campo);
    });

    document.getElementById('editor-evidencia-container').innerHTML = '';
    document.getElementById('editor-left-actions').style.display = 'none';

    const saveBtn = document.getElementById('editor-save-btn');
    saveBtn.innerHTML = extintorBajaOrigen
        ? '<i class="fas fa-exchange-alt"></i> Crear y reemplazar'
        : '<i class="fas fa-plus"></i> Registrar extintor';
    saveBtn.onclick = function() { guardarNuevoExtintor(); };

    closeModal();
    editorModal.classList.add('active');
}
function abrirEditor(itemIndex) {
    if (!isAdmin) return;
    currentItemIndex = itemIndex;
    const item = misDatos[currentItemIndex];
    const esBaja = (item["CONDICION"] === "Baja");

    if (esBaja) {
        editorModoCreacion = false;
        document.getElementById('editor-title').innerHTML = `<i class="fas fa-eye" style="color:#6b7280;"></i> Visualización de Extintor (Baja)`;
        document.getElementById('editor-subtitle').textContent = 'Este extintor está dado de baja. No se permiten modificaciones.';
        const editorBody = document.getElementById('editor-body');
        editorBody.innerHTML = '';
        Object.keys(item).forEach(clave => {
            if (['id', 'created_at', 'updated_at'].includes(clave)) return;
            const campo = document.createElement('div');
            campo.className = 'editor-field';
            const label = document.createElement('label');
            label.textContent = nombresMostrar[clave] || clave;
            const input = String(item[clave] ?? '').length > 70 ? document.createElement('textarea') : document.createElement('input');
            input.value = String(item[clave] ?? '');
            input.dataset.key = clave;
            input.disabled = true;
            campo.appendChild(label);
            campo.appendChild(input);
            editorBody.appendChild(campo);
        });
        const evidencia = item["evidencia"] || "";
        const evidenciaContainer = document.getElementById('editor-evidencia-container');
        if (evidencia.trim()) {
            evidenciaContainer.innerHTML = `<div style="background:#f1f5f9; padding:12px; border-radius:12px; margin-top:10px;"><strong>Evidencia de baja:</strong> <a href="${evidencia}" target="_blank" style="color:#3b82f6;text-decoration:underline;">Certificado de descarte</a></div>`;
        } else {
            evidenciaContainer.innerHTML = '';
        }
        document.getElementById('editor-left-actions').style.display = 'none';
        const saveBtn = document.getElementById('editor-save-btn');
        saveBtn.innerHTML = '<i class="fas fa-plus"></i> Registrar nuevo extintor';
        saveBtn.onclick = function() { abrirNuevoExtintor(); };
        closeModal();
        editorModal.classList.add('active');
        return;
    }

    editorModoCreacion = false;
    document.getElementById('editor-title').innerHTML = `<i class="fas fa-edit" style="color:#7c3aed;"></i> Editor de Extintor`;
    document.getElementById('editor-subtitle').textContent = 'Modifica cualquier dato y guarda todos los cambios juntos.';
    const editorBody = document.getElementById('editor-body');
    editorBody.innerHTML = '';
    Object.keys(item).forEach(clave => {
        if (['id', 'created_at', 'updated_at'].includes(clave)) return;
        const campo = document.createElement('div');
        campo.className = 'editor-field';
        const label = document.createElement('label');
        label.textContent = nombresMostrar[clave] || clave;
        const input = String(item[clave] ?? '').length > 70 ? document.createElement('textarea') : document.createElement('input');
        input.value = String(item[clave] ?? '');
        input.dataset.key = clave;
        input.disabled = false;
        campo.appendChild(label);
        campo.appendChild(input);
        editorBody.appendChild(campo);
    });
    document.getElementById('editor-evidencia-container').innerHTML = '';
    document.getElementById('editor-left-actions').style.display = 'flex';
    const saveBtn = document.getElementById('editor-save-btn');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
    saveBtn.onclick = function() { guardarEdicion(); };
    closeModal();
    editorModal.classList.add('active');
}

function closeEditorModal() {
    editorModal.classList.remove('active');
    editorModoCreacion = false;
    const saveBtn = document.getElementById('editor-save-btn');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
    saveBtn.onclick = function() { guardarEdicion(); };
    document.getElementById('editor-left-actions').style.display = 'flex';
    document.getElementById('editor-title').innerHTML = `<i class="fas fa-edit" style="color:#7c3aed;"></i> Editor de Extintor`;
    document.getElementById('editor-subtitle').textContent = 'Modifica cualquier dato y guarda todos los cambios juntos.';
    document.getElementById('editor-evidencia-container').innerHTML = '';
}
async function guardarEdicion() {
    if (!isAdmin || currentItemIndex === null) return;

    const item = misDatos[currentItemIndex];
    const no = String(item["N"]);
    const cambios = {};

    document.querySelectorAll('#editor-body [data-key]').forEach(campo => {
        const clave = campo.dataset.key;
        const valor = campo.value.trim();
        const original = item[clave] ?? '';
        if (String(original) !== valor) {
            cambios[clave] = valor === '' ? null : valor;
        }
    });

    if (Object.keys(cambios).length === 0) {
        await showGenericModal('No hay cambios para guardar.', 'Aviso');
        return;
    }

    const saveBtn = document.getElementById('editor-save-btn');
    const textoOriginal = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const { error } = await supabaseClient
            .from(TABLA_EXTINTORES)
            .update(cambios)
            .eq('N', no);

        if (error) throw error;

        const idx = misDatos.findIndex(x => String(x.N) === no);
        if (idx !== -1) {
            misDatos[idx] = { ...misDatos[idx], ...cambios };
        }

        closeEditorModal();
        poblarResponsables();
        applyFilters();

        await showGenericModal('Cambios guardados correctamente.', 'Éxito');

    } catch (err) {
        console.error(err);
        await showGenericModal('Error al guardar: ' + (err.message || err), 'Error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = textoOriginal;
    }
}

async function guardarNuevoExtintor() {
    if (!isAdmin || !editorModoCreacion) return;

    const nuevo = {};
    let numeroNuevo = '';
    document.querySelectorAll('#editor-body [data-key]').forEach(campo => {
        const clave = campo.dataset.key;
        const valor = campo.value.trim();
        if (clave === 'N') numeroNuevo = valor;
        nuevo[clave] = valor;
    });

    if (!numeroNuevo) {
        await showGenericModal('El número del extintor es obligatorio.', 'Aviso');
        return;
    }

    const { data: existente } = await supabaseClient
        .from(TABLA_EXTINTORES)
        .select('N, CONDICION')
        .eq('N', numeroNuevo)
        .maybeSingle();

        if (existente) {
        if (existente.CONDICION === 'Baja') {
            // Renombrado silencioso sin preguntar
            const sufijo = `-BAJA-${new Date().toISOString().slice(0, 10)}`;
            const nombreViejo = `${numeroNuevo}${sufijo}`;

            await supabaseClient.from(TABLA_EXTINTORES).update({ N: nombreViejo }).eq('N', numeroNuevo);
            await Promise.all([
                supabaseClient.from(TABLA_MOVIMIENTOS).update({ n_extintor: nombreViejo }).eq('n_extintor', numeroNuevo),
                supabaseClient.from(TABLA_OBSERVACIONES).update({ n_extintor: nombreViejo }).eq('n_extintor', numeroNuevo)
            ]);

            if (extintorBajaOrigen) {
                extintorBajaOrigen.N = nombreViejo;
            }
        } else {
            await showGenericModal(
                `El número "${numeroNuevo}" ya está ocupado por un extintor activo ` +
                `(condición: ${existente.CONDICION || 'Vigente'}). Usa otro número.`,
                'Número duplicado',
                'Entendido'
            );
            return;
        }
    }

    if (!nuevo['CONDICION']) nuevo['CONDICION'] = 'Vigente';
    if (nuevo['ESTADO'] === undefined) nuevo['ESTADO'] = null;
    if (nuevo['ubicacion_prestamo'] === undefined) nuevo['ubicacion_prestamo'] = null;
    if (!nuevo['observaciones']) nuevo['observaciones'] = 'Creado manualmente desde el sistema.';

    Object.keys(nuevo).forEach(k => { if (nuevo[k] === '') nuevo[k] = null; });

    const saveBtn = document.getElementById('editor-save-btn');
    const textoOriginal = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

    try {
        const { data: insertData, error: insertErr } = await supabaseClient
            .from(TABLA_EXTINTORES)
            .insert([nuevo])
            .select()
            .single();

        if (insertErr) throw insertErr;

        if (extintorBajaOrigen) {
            const noOrigen = String(extintorBajaOrigen['N']);
            const fecha = new Date().toLocaleString('es-ES');

            const obsActualizada =
                (extintorBajaOrigen['observaciones'] || '') +
                `\n[Reemplazo ${new Date().toLocaleDateString('es-ES')}] Reemplazado por nuevo extintor N° ${numeroNuevo}`;

            const detalleReemplazo = `Nuevo extintor N° ${numeroNuevo} creado como reemplazo del extintor dado de baja N° ${noOrigen}`;

            const [updRes, movRes] = await Promise.all([
                supabaseClient.from(TABLA_EXTINTORES)
                    .update({ observaciones: obsActualizada })
                    .eq('N', noOrigen),
                supabaseClient.from(TABLA_MOVIMIENTOS)
                    .insert([{
                        n_extintor: numeroNuevo,
                        tipo: 'reemplazo_baja',
                        personal: 'Sistema',
                        reemplazo: noOrigen,
                        detalle: detalleReemplazo,
                        activo: false
                    }])
                    .select()
                    .single()
            ]);

            if (updRes.error) console.error('Error actualizando observaciones del origen:', updRes.error);
            if (movRes.error) console.error('Error registrando movimiento de reemplazo:', movRes.error);

            const idxOrigen = misDatos.findIndex(x => String(x.N) === noOrigen);
            if (idxOrigen !== -1) {
                misDatos[idxOrigen] = { ...misDatos[idxOrigen], observaciones: obsActualizada };
            }
            extintoresReemplazados[noOrigen] = numeroNuevo;

            historialCompleto.unshift({
                id: movRes.data?.id,
                fecha: fecha,
                no: numeroNuevo,
                tipo: 'Reemplazo de baja',
                personal: 'Sistema',
                detalle: detalleReemplazo
            });
        }

        if (insertData) {
            misDatos.push(insertData);
            misDatos.sort(compararNumeros);
        }

        const eraReemplazo = !!extintorBajaOrigen;
        const numeroViejoReemplazado = extintorBajaOrigen ? extintorBajaOrigen.N : null;
        extintorBajaOrigen = null;

        closeEditorModal();
        poblarResponsables();
        applyFilters();

        await showGenericModal(
            eraReemplazo
                ? `Extintor N° ${numeroNuevo} creado y registrado como reemplazo del N° ${numeroViejoReemplazado}.`
                : 'Extintor creado exitosamente.',
            'Éxito'
        );

    } catch (err) {
        console.error(err);
        await showGenericModal('Error al crear el extintor: ' + (err.message || err), 'Error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = textoOriginal;
    }
}
async function abrirBaja() {
    if (!isAdmin || currentItemIndex === null) return;
    const item = misDatos[currentItemIndex];
    closeEditorModal();

    const confirmar = await showGenericModal(
        `¿Seguro que deseas descartar el extintor N° ${item["N"]}? Desaparecerá de la tabla principal.`,
        'Confirmar Descarte',
        'Sí, descartar',
        'Cancelar'
    );

    if (confirmar) {
        const no = String(item["N"]);
        const updateData = {
            CONDICION: 'Baja',
            ESTADO: 'No Disponible',
            ubicacion_prestamo: null,
            observaciones: (item["observaciones"] || '') + `\n[Descartado ${new Date().toLocaleDateString('es-ES')}]`
        };

        try {
            const { error } = await supabaseClient.from(TABLA_EXTINTORES).update(updateData).eq('N', no);
            if (error) throw error;

            const idx = misDatos.findIndex(x => String(x.N) === no);
            if (idx !== -1) misDatos[idx] = { ...misDatos[idx], ...updateData };

            applyFilters(); 
            await showGenericModal('Extintor descartado. Sube el certificado en "Extintores descartados".', 'Éxito');
        } catch (err) {
            console.error(err);
            await showGenericModal('Error al descartar: ' + err.message, 'Error');
        }
    }
}

let descartadoIndex = null;

function verDescartados() {
    if (!isAdmin) return; // Protección extra

    const descartados = misDatos.filter(item => item["CONDICION"] === 'Baja');
    const body = document.getElementById('descartados-body');
    body.innerHTML = '';
    
    if (descartados.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">No hay extintores descartados.</td></tr>`;
    } else {
        descartados.forEach(item => {
            const idx = misDatos.indexOf(item);
            const tieneEvidencia = item["evidencia"] && item["evidencia"].trim() !== "";
            const linkEvidencia = tieneEvidencia ? `<a href="${item["evidencia"]}" target="_blank" style="color:#3b82f6;text-decoration:underline;">Ver Certificado</a>` : `<span style="color:#ef4444; font-size:0.85rem;">Falta subir</span>`;
            
            // Limpiamos el texto: quitamos las URLs y cortamos si es muy largo
            let obs = item["observaciones"] || '-';
            obs = obs.replace(/https?:\/\/[^\s]+/g, '').replace(/Evidencia:/gi, '').trim();
            if (obs.length > 80) obs = obs.substring(0, 80) + '...';
            
            body.innerHTML += `
                <tr>
                    <td><strong>${item["N"]}</strong></td>
                    <td>${item["AREA RESPONSABLE"] || '-'}</td>
                    <td>${obs}</td>
                    <td>${linkEvidencia}</td>
                    <td>
                        <button class="btn btn-primary" style="padding:4px 10px; font-size:0.75rem;" onclick="abrirEditarDescartado(${idx})"><i class="fas fa-edit"></i> Editar</button>
                    </td>
                </tr>
            `;
        });
    }
    document.getElementById('descartados-modal').classList.add('active');
}

function closeDescartadosModal() { document.getElementById('descartados-modal').classList.remove('active'); }

function abrirEditarDescartado(index) {
    descartadoIndex = index;
    const item = misDatos[index];
    document.getElementById('descarte-numero').value = item["N"];
    document.getElementById('descarte-motivo').value = item["observaciones"] || '';
    document.getElementById('descarte-archivo').value = '';
    document.getElementById('descarte-file-name').textContent = item["evidencia"] ? 'Ya tiene un certificado (se reemplazará si subes uno nuevo).' : 'No hay certificado subido.';
    document.getElementById('editar-descartado-modal').classList.add('active');
}

function closeEditarDescartadoModal() {
    document.getElementById('editar-descartado-modal').classList.remove('active');
    descartadoIndex = null;
}

async function guardarEditarDescartado() {
    if (descartadoIndex === null) return;
    const item = misDatos[descartadoIndex];
    const no = String(item["N"]);
    const motivo = document.getElementById('descarte-motivo').value.trim();
    const archivo = document.getElementById('descarte-archivo').files[0];
    
    const btn = document.querySelector('#editar-descartado-modal .btn-primary');
    const txtOrig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        let evidenciaUrl = item["evidencia"] || null;
        
        if (archivo) {
            const fileExt = (archivo.name.split('.').pop() || 'bin').toLowerCase();
            const fileName = `baja_${no}_${Date.now()}.${fileExt}`;
            const { error: uploadErr } = await supabaseClient.storage.from(BUCKET_NAME).upload(`bajas/${fileName}`, archivo, { cacheControl: '3600', upsert: false, contentType: archivo.type });
            if (uploadErr) throw uploadErr;
            const { data: urlData } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(`bajas/${fileName}`);
            evidenciaUrl = urlData?.publicUrl || null;
        }
        
        const updateData = {
            observaciones: motivo,
            evidencia: evidenciaUrl || ''
        };
        
        const { error } = await supabaseClient.from(TABLA_EXTINTORES).update(updateData).eq('N', no);
        if (error) throw error;
        
        misDatos[descartadoIndex] = { ...misDatos[descartadoIndex], ...updateData };
        
        closeEditarDescartadoModal();
        verDescartados();
        await showGenericModal('Datos actualizados correctamente.', 'Éxito');
        
    } catch (err) {
        console.error(err);
        await showGenericModal('Error al guardar: ' + err.message, 'Error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOrig;
    }
}
function abrirNuevoReemplazo() {
    if (!isAdmin || currentItemIndex === null) return;
    const item = misDatos[currentItemIndex];
    const container = document.getElementById('nuevo-reemplazo-body');
    container.innerHTML = '';
    const camposNuevo = ['N', 'N SERIE ACTUAL', 'TIPO', 'CAP.', 'costo_recarga', 'zona', 'gerencia', 'AREA RESPONSABLE', 'UBICACION', 'ph_vencimiento', 'F. VENC.', 'fecha_fabricacion', 'proveedor', 'anterior_ubicacion', 'vigencia_actual'];
    const valoresDefault = { 'AREA RESPONSABLE': item["AREA RESPONSABLE"] || '', 'UBICACION': item["UBICACION"] || '', 'zona': item["zona"] || '', 'gerencia': item["gerencia"] || '', 'TIPO': item["TIPO"] || '', 'CAP.': item["CAP."] || '', 'vigencia_actual': 'Vigente' };
    camposNuevo.forEach(clave => {
        const campo = document.createElement('div');
        campo.className = 'editor-field';
        const label = document.createElement('label');
        label.textContent = nombresMostrar[clave] || clave;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = valoresDefault[clave] || '';
        input.dataset.key = clave;
        campo.appendChild(label);
        campo.appendChild(input);
        container.appendChild(campo);
    });
    nuevoReemplazoData.originalItem = item;
    closeEditorModal();
    document.getElementById('nuevo-reemplazo-modal').classList.add('active');
}
function closeNuevoReemplazoModal() { document.getElementById('nuevo-reemplazo-modal').classList.remove('active'); nuevoReemplazoData = {}; }

async function confirmarNuevoReemplazo() {
    if (!isAdmin || !nuevoReemplazoData.originalItem) return;
    const original = nuevoReemplazoData.originalItem;
    const noOriginal = String(original["N"]);
    const nuevo = {};
    const campos = document.querySelectorAll('#nuevo-reemplazo-body [data-key]');
    let numeroNuevo = '';
    campos.forEach(campo => {
        const clave = campo.dataset.key;
        const valor = campo.value.trim();
        if (clave === 'N') numeroNuevo = valor;
        nuevo[clave] = valor;
    });
    if (!numeroNuevo) { await showGenericModal('El número del nuevo extintor es obligatorio.', 'Aviso'); return; }

    const { data: existente } = await supabaseClient
        .from(TABLA_EXTINTORES)
        .select('N, CONDICION, observaciones')
        .eq('N', numeroNuevo)
        .maybeSingle();

        if (existente) {
        if (existente.CONDICION === 'Baja') {
            // Renombrado silencioso sin preguntar
            const sufijo = `-BAJA-${new Date().toISOString().slice(0, 10)}`;
            const nombreViejo = `${numeroNuevo}${sufijo}`;

            await supabaseClient.from(TABLA_EXTINTORES).update({ N: nombreViejo }).eq('N', numeroNuevo);
            await Promise.all([
                supabaseClient.from(TABLA_MOVIMIENTOS).update({ n_extintor: nombreViejo }).eq('n_extintor', numeroNuevo),
                supabaseClient.from(TABLA_OBSERVACIONES).update({ n_extintor: nombreViejo }).eq('n_extintor', numeroNuevo)
            ]);

            if (extintorBajaOrigen) {
                extintorBajaOrigen.N = nombreViejo;
            }
        } else {
            await showGenericModal(
                `El número "${numeroNuevo}" ya está ocupado por un extintor activo ` +
                `(condición: ${existente.CONDICION || 'Vigente'}). Usa otro número.`,
                'Número duplicado',
                'Entendido'
            );
            return;
        }
    }
    nuevo['CONDICION'] = 'Vigente';
    nuevo['ESTADO'] = 'Prestado';
    nuevo['ubicacion_prestamo'] = `Préstamo a: ${original["AREA RESPONSABLE"] || 'Sin responsable'} | Reemplaza al N ${noOriginal}`;
    nuevo['observaciones'] = `Creado como reemplazo del extintor ${noOriginal}`;
    Object.keys(nuevo).forEach(k => { if (nuevo[k] === '') nuevo[k] = null; });

    const { data: insertData, error: insertErr } = await supabaseClient
        .from(TABLA_EXTINTORES)
        .insert([nuevo])
        .select()
        .single();

    if (insertErr) {
        console.error(insertErr);
        await showGenericModal('Error al crear el nuevo extintor: ' + insertErr.message, 'Error');
        return;
    }

    const updateOriginal = {
        ubicacion_prestamo: 'Mantenimiento / Almacén SST',
        CONDICION: 'Reemplazado',
        ESTADO: 'Almacén SST',
        observaciones: (original["observaciones"] || '') + `\nReemplazado por nuevo extintor N° ${numeroNuevo}`
    };

    const detalleOriginal = `Extintor ${noOriginal} reemplazado por nuevo extintor ${numeroNuevo}`;
    const detalleNuevo = `Nuevo extintor ${numeroNuevo} creado para reemplazar a ${noOriginal}`;
    const responsableOriginal = original["AREA RESPONSABLE"] || 'Sin responsable';

    const [updRes, movRes] = await Promise.all([
        supabaseClient.from(TABLA_EXTINTORES).update(updateOriginal).eq('N', noOriginal),
        supabaseClient.from(TABLA_MOVIMIENTOS).insert([
            {
                n_extintor: noOriginal,
                tipo: 'prestamo_interno',
                personal: 'Sistema',
                motivo: 'Reemplazado',
                reemplazo: numeroNuevo,
                responsable_destino: 'Almacén SST',
                ubicacion_destino: 'Mantenimiento / Almacén SST',
                detalle: detalleOriginal,
                activo: true
            },
            {
                n_extintor: numeroNuevo,
                tipo: 'prestamo_interno',
                personal: 'Sistema',
                motivo: 'Reemplazo',
                reemplazo: noOriginal,
                responsable_destino: responsableOriginal,
                ubicacion_destino: `Préstamo a: ${responsableOriginal} | Reemplaza al N ${noOriginal}`,
                detalle: detalleNuevo,
                activo: true
            }
        ]).select()
    ]);

    if (updRes.error) {
        console.error(updRes.error);
        await showGenericModal('Error al actualizar el extintor original: ' + updRes.error.message, 'Error');
        return;
    }
    if (movRes.error) {
        console.error(movRes.error);
        await showGenericModal('Error al registrar movimientos: ' + movRes.error.message, 'Error');
        return;
    }

    const idxOriginal = misDatos.findIndex(x => String(x.N) === noOriginal);
    if (idxOriginal !== -1) {
        misDatos[idxOriginal] = { ...misDatos[idxOriginal], ...updateOriginal };
    }
    if (insertData) {
        misDatos.push(insertData);
        misDatos.sort(compararNumeros);
    }

    const fecha = new Date().toLocaleString('es-ES');

    movimientosPrestamoActivos[noOriginal] = {
        tipo: 'prestamo_interno',
        personal: 'Sistema',
        motivo: 'Reemplazado',
        reemplazo: numeroNuevo,
        responsable_destino: 'Almacén SST',
        ubicacion_destino: 'Mantenimiento / Almacén SST',
        fecha: fecha
    };
    movimientosActivos[noOriginal] = movimientosPrestamoActivos[noOriginal];

    movimientosPrestamoActivos[numeroNuevo] = {
        tipo: 'prestamo_interno',
        personal: 'Sistema',
        motivo: 'Reemplazo',
        reemplazo: noOriginal,
        responsable_destino: responsableOriginal,
        ubicacion_destino: `Préstamo a: ${responsableOriginal} | Reemplaza al N ${noOriginal}`,
        fecha: fecha
    };
    movimientosActivos[numeroNuevo] = movimientosPrestamoActivos[numeroNuevo];

    const movsInsertados = movRes.data || [];
    historialCompleto.unshift(
        {
            id: movsInsertados[1]?.id,
            fecha: fecha,
            no: numeroNuevo,
            tipo: 'Nuevo reemplazo',
            personal: 'Sistema',
            detalle: detalleNuevo
        },
        {
            id: movsInsertados[0]?.id,
            fecha: fecha,
            no: noOriginal,
            tipo: 'Reemplazo por nuevo',
            personal: 'Sistema',
            detalle: detalleOriginal
        }
    );

    closeNuevoReemplazoModal();
    poblarResponsables();
    applyFilters();

    await showGenericModal(`Nuevo extintor ${numeroNuevo} creado y reemplazo registrado.`, 'Éxito');
}

// ============================================================
//  INICIO DE LA APP
// ============================================================
async function iniciarApp() {
    const [extRes, movRes, obsRes, histRes] = await Promise.all([
        supabaseClient.from(TABLA_EXTINTORES).select('*').order('N'),
        supabaseClient.from(TABLA_MOVIMIENTOS).select('*')
            .eq('activo', true)
            .in('tipo', ['prestamo_interno', 'prestamo_unidad', 'garantia']),
        supabaseClient.from(TABLA_OBSERVACIONES).select('*')
            .order('created_at', { ascending: false })
            .limit(100),
        supabaseClient.from(TABLA_MOVIMIENTOS).select('*')
            .order('created_at', { ascending: false })
            .limit(200)
    ]);

    const data = extRes.data;
    const error = extRes.error;

    if (error) {
        tableBody.innerHTML = `<tr><td colspan="${isAdmin ? 9 : 4}" style="text-align:center; color:#ef4444;">Error de Supabase: ${error.message}</td></tr>`;
        return;
    }

    misDatos = [...data].sort(compararNumeros);

    movimientosPrestamoActivos = {};
    movimientosGarantiaActivos = {};
    movimientosActivos = {};

    (movRes.data || []).forEach(mov => {
        const fecha = new Date(mov.created_at).toLocaleString('es-ES');
        if (mov.tipo === 'prestamo_interno' || mov.tipo === 'prestamo_unidad') {
            movimientosPrestamoActivos[mov.n_extintor] = {
                tipo: mov.tipo, personal: mov.personal, motivo: mov.motivo,
                reemplazo: mov.reemplazo, responsable_destino: mov.responsable_destino,
                ubicacion_destino: mov.ubicacion_destino, fecha: fecha
            };
            movimientosActivos[mov.n_extintor] = movimientosPrestamoActivos[mov.n_extintor];
        } else if (mov.tipo === 'garantia') {
            movimientosGarantiaActivos[mov.n_extintor] = {
                reemplazo: mov.reemplazo, personal: mov.personal, fecha: fecha
            };
            if (!movimientosPrestamoActivos[mov.n_extintor]) {
                movimientosActivos[mov.n_extintor] = movimientosGarantiaActivos[mov.n_extintor];
            }
        }
    });

    observacionesPublicas = (obsRes.data || []).map(o => ({
        id: o.id, no: o.n_extintor, texto: o.texto,
        fecha: new Date(o.created_at).toLocaleDateString('es-ES')
    }));

    extintoresReemplazados = {};
    (histRes.data || []).forEach(mov => {
        if (mov.tipo === 'reemplazo_baja' && mov.reemplazo) {
            extintoresReemplazados[String(mov.reemplazo)] = String(mov.n_extintor);
        }
    });

    historialCompleto = (histRes.data || []).map(mov => ({
        id: mov.id,
        fecha: new Date(mov.created_at).toLocaleString('es-ES'),
        no: mov.n_extintor,
        tipo: mov.tipo,
        personal: mov.personal || '-',
        detalle: mov.detalle || ''
    }));
    
    actualizarFiltrosDesdeDB(); 
    poblarResponsables();
    inicializarAutocompletes();
    renderCalendar();
    applyFilters();
}

// ============================================================
// SISTEMA DE MODALES CON ESC Y SIN CLICK FUERA
// ============================================================
let modalesAbiertos = [];

function registrarModal(modal) {
    if (!modalesAbiertos.includes(modal)) {
        modalesAbiertos.push(modal);
    }
}

function quitarModal(modal) {
    modalesAbiertos = modalesAbiertos.filter(m => m !== modal);
}

function obtenerFuncionCerrar(modal) {
    const mapa = {
        'detail-modal': closeModal,
        'loan-modal': closeLoanModal,
        'history-modal': closeHistoryModal,
        'observations-modal': closeObservationsModal,
        'observation-form-modal': closeObservationFormModal,
        'editor-modal': closeEditorModal,
        'generic-modal': closeGenericModal,
        'prompt-modal': closePromptModal,
        'descartados-modal': closeDescartadosModal,
        'editar-descartado-modal': closeEditarDescartadoModal,
        'nuevo-reemplazo-modal': closeNuevoReemplazoModal,
        'garantias-pendientes-modal': closeGarantiasPendientesModal
    };
    return mapa[modal.id] || null;
}

// Listener global de ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalesAbiertos.length > 0) {
        e.preventDefault();
        const modalActivo = modalesAbiertos[modalesAbiertos.length - 1];
        const cerrar = obtenerFuncionCerrar(modalActivo);
        if (cerrar) cerrar();
    }
});

// Modificar cada función de apertura para registrar el modal
const originalShowModal = showModal;
showModal = function(item) {
    originalShowModal(item);
    registrarModal(detailModal);
};

const originalVerHistorial = verHistorial;
verHistorial = function() {
    originalVerHistorial();
    registrarModal(historyModal);
};

const originalVerObservaciones = verObservacionesGenerales;
verObservacionesGenerales = function() {
    originalVerObservaciones();
    registrarModal(observationsModal);
};

const originalAbrirFormulario = abrirFormularioObservacion;
abrirFormularioObservacion = function(itemIndex) {
    originalAbrirFormulario(itemIndex);
    registrarModal(observationFormModal);
};

const originalOpenLoan = openLoanForm;
openLoanForm = function(itemIndex) {
    originalOpenLoan(itemIndex);
    registrarModal(loanModal);
};

const originalAbrirEditor = abrirEditor;
abrirEditor = function(itemIndex) {
    originalAbrirEditor(itemIndex);
    registrarModal(editorModal);
};

const originalAbrirNuevo = abrirNuevoExtintor;
abrirNuevoExtintor = function() {
    originalAbrirNuevo();
    registrarModal(editorModal);
};

const originalVerDescartados = verDescartados;
verDescartados = function() {
    originalVerDescartados();
    registrarModal(document.getElementById('descartados-modal'));
};

const originalAbrirEditar = abrirEditarDescartado;
abrirEditarDescartado = function(index) {
    originalAbrirEditar(index);
    registrarModal(document.getElementById('editar-descartado-modal'));
};

const originalAbrirReemplazo = abrirNuevoReemplazo;
abrirNuevoReemplazo = function() {
    originalAbrirReemplazo();
    registrarModal(document.getElementById('nuevo-reemplazo-modal'));
};

const originalVerGarantias = verGarantiasPendientes;
verGarantiasPendientes = function() {
    originalVerGarantias();
    registrarModal(document.getElementById('garantias-pendientes-modal'));
};

const originalShowGeneric = showGenericModal;
showGenericModal = function(message, title, confirmText, cancelText) {
    const promesa = originalShowGeneric(message, title, confirmText, cancelText);
    registrarModal(document.getElementById('generic-modal'));
    return promesa;
};

const originalShowPrompt = showPromptModal;
showPromptModal = function(message, title, defaultValue) {
    const promesa = originalShowPrompt(message, title, defaultValue);
    registrarModal(document.getElementById('prompt-modal'));
    return promesa;
};

// Modificar cada función de cierre para quitar de la pila
const originalCloseModal = closeModal;
closeModal = function() {
    originalCloseModal();
    quitarModal(detailModal);
};

const originalCloseLoan = closeLoanModal;
closeLoanModal = function() {
    originalCloseLoan();
    quitarModal(loanModal);
};

const originalCloseHistory = closeHistoryModal;
closeHistoryModal = function() {
    originalCloseHistory();
    quitarModal(historyModal);
};

const originalCloseObs = closeObservationsModal;
closeObservationsModal = function() {
    originalCloseObs();
    quitarModal(observationsModal);
};

const originalCloseObsForm = closeObservationFormModal;
closeObservationFormModal = function() {
    originalCloseObsForm();
    quitarModal(observationFormModal);
};

const originalCloseEditor = closeEditorModal;
closeEditorModal = function() {
    originalCloseEditor();
    quitarModal(editorModal);
};

const originalCloseGeneric = closeGenericModal;
closeGenericModal = function() {
    originalCloseGeneric();
    quitarModal(document.getElementById('generic-modal'));
};

const originalClosePrompt = closePromptModal;
closePromptModal = function() {
    originalClosePrompt();
    quitarModal(document.getElementById('prompt-modal'));
};

const originalCloseDesc = closeDescartadosModal;
closeDescartadosModal = function() {
    originalCloseDesc();
    quitarModal(document.getElementById('descartados-modal'));
};

const originalCloseEditDesc = closeEditarDescartadoModal;
closeEditarDescartadoModal = function() {
    originalCloseEditDesc();
    quitarModal(document.getElementById('editar-descartado-modal'));
};

const originalCloseReemp = closeNuevoReemplazoModal;
closeNuevoReemplazoModal = function() {
    originalCloseReemp();
    quitarModal(document.getElementById('nuevo-reemplazo-modal'));
};

const originalCloseGar = closeGarantiasPendientesModal;
closeGarantiasPendientesModal = function() {
    originalCloseGar();
    quitarModal(document.getElementById('garantias-pendientes-modal'));
};

// Arrancar la aplicación
iniciarApp();
