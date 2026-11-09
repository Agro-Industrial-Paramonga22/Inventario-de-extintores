// ═══════════════════════════════════════════════════════════
//  FILTROS COLAPSABLES EN MÓVIL
// ═══════════════════════════════════════════════════════════
(function initMobileFilters() {
    const filtersBar = document.getElementById('filtersBar');
    const toggle = document.getElementById('filtersToggle');
    if (!filtersBar || !toggle) return;

    const isMobile = () => window.innerWidth <= 640;

    function syncOnLoad() {
        if (isMobile() && !filtersBar.dataset.initialized) {
            filtersBar.classList.add('collapsed');
            filtersBar.dataset.initialized = 'true';
        }
        if (!isMobile()) {
            filtersBar.classList.remove('collapsed');
            toggle.classList.remove('open');
        }
    }

    toggle.addEventListener('click', () => {
        filtersBar.classList.toggle('collapsed');
        toggle.classList.toggle('open');
    });

    window.addEventListener('resize', syncOnLoad);
    syncOnLoad();
})();

function actualizarEstadoCondicionFilter() {
    const condicionSelect = document.getElementById('condicion-filter');
    if (!condicionSelect) return;

    if (isAdmin) {
        condicionSelect.disabled = false;
        return;
    }

    const tieneArea = responsableFilter.value.trim() !== '';
    condicionSelect.disabled = !tieneArea;

    if (!tieneArea) {
        condicionSelect.value = '';
    }
}
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
let isAdmin = sessionStorage.getItem('extintor_admin') === 'true';

// ============================================================
//  REFERENCIAS DOM
// ============================================================
const condicionFilter = document.getElementById('condicion-filter');
const responsableFilter = document.getElementById('responsable-filter');
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
let bajaArchivo = null;
let nuevoReemplazoData = {};
let modoGarantiaForzado = false;

let editorModoCreacion = false;

function actualizarVisibilidadFiltros() {
    const numeroGroup = document.getElementById('numero-filter')?.closest('.filter-group');
    const dateWrap = document.querySelector('.date-filter-wrap');
    const condicionGroup = document.getElementById('condicion-filter')?.closest('.filter-group');

    const displayAdmin = isAdmin ? '' : 'none';
    if (numeroGroup) numeroGroup.style.display = displayAdmin;
    if (dateWrap) dateWrap.style.display = displayAdmin;

    if (condicionGroup) condicionGroup.style.display = '';

    if (!isAdmin && numeroFilter) numeroFilter.value = '';

    actualizarEstadoCondicionFilter();
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
//  MENÚ HAMBURGUESA
// ============================================================
const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');

function toggleMenu() {
    menuDropdown.classList.toggle('open');
}

function cerrarMenu() {
    menuDropdown.classList.remove('open');
}

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-container')) {
        cerrarMenu();
    }
});

// ============================================================
//  MODALES GENÉRICOS
// ============================================================
let genericResolve = null;
let promptResolve = null;

function showGenericModal(message, title = 'Aviso', confirmText = 'Aceptar', cancelText = null) {
    return new Promise((resolve) => {
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
function confirmGenericModal() { document.getElementById('generic-modal').classList.remove('active'); if (genericResolve) genericResolve(true); genericResolve = null; }
function cancelGenericModal() { document.getElementById('generic-modal').classList.remove('active'); if (genericResolve) genericResolve(false); genericResolve = null; }
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
function actualizarOpcionesCondicion() {
    const select = document.getElementById('condicion-filter');
    const valorActual = select.value;
    select.innerHTML = '';

    const opcionesBase = [
        { value: '', label: 'Condición' },
        { value: 'Vigente', label: 'Vigente' },
        { value: 'Vencido', label: 'Vencido' }
    ];

    const opcionesAdmin = [
        { value: 'Mantenimiento', label: 'Mantenimiento' },
        { value: 'Usado', label: 'Usado' },
        { value: 'Despresurizado', label: 'Despresurizado' },
        { value: 'Dañado', label: 'Dañado' },
        { value: 'Baja', label: 'Baja' }
    ];

    const opciones = isAdmin ? [...opcionesBase, ...opcionesAdmin] : opcionesBase;

    opciones.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    });

    const valoresDisponibles = opciones.map(o => o.value);
    select.value = valoresDisponibles.includes(valorActual) ? valorActual : '';
}

function actualizarMenuAdmin() {
    const adminText = document.getElementById('menuAdminText');
    const adminBadge = document.getElementById('menuAdminBadge');
    const menuObservaciones = document.getElementById('menuObservaciones');
    const menuHistorial = document.getElementById('menuHistorial');
    const menuExportar = document.getElementById('menuExportar');
    const menuAgregarExtintor = document.getElementById('menuAgregarExtintor');

    if (isAdmin) {
        const nombreAdmin = sessionStorage.getItem('extintor_admin_nombre') || 'Administrador';
        const rolAdmin = sessionStorage.getItem('extintor_admin_rol') || 'admin';
        adminText.textContent = `${nombreAdmin} (${rolAdmin})`;

        adminBadge.style.display = 'inline-block';
        adminBadge.textContent = 'ACTIVO';
        adminBadge.className = 'badge-admin active';

        menuObservaciones.style.display = 'flex';
        menuHistorial.style.display = 'flex';
        menuExportar.style.display = 'flex';

        if (menuAgregarExtintor) {
            menuAgregarExtintor.style.display = 'flex';
        }
    } else {
        adminText.textContent = 'Modo Administrador';
        adminBadge.style.display = 'none';

        menuObservaciones.style.display = 'none';
        menuHistorial.style.display = 'none';
        menuExportar.style.display = 'none';

        if (menuAgregarExtintor) {
            menuAgregarExtintor.style.display = 'none';
        }
    }
}

function aplicarPermisos() {
    const estadoHeader = document.getElementById('estado-header');
    const garantiaHeader = document.getElementById('garantia-header');

    if (!isAdmin) {
        if (estadoHeader) estadoHeader.style.display = 'none';
    } else {
        if (estadoHeader) estadoHeader.style.display = 'table-cell';
    }

    actualizarOpcionesCondicion();
    actualizarMenuAdmin();
    actualizarVisibilidadFiltros();

    if (garantiaHeader) garantiaHeader.style.display = 'table-cell';
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
    const estado = item["ESTADO"] || "";
    const condicion = item["CONDICION"] || "";
    if (estado === "Almacén SST") return isAdmin ? (condicion || "Usado") : "Mantenimiento";
    if (condicion === "Baja") return "Baja";
    return isItemExpired(item) ? "Vencido" : "Vigente";
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
const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function sameDay(a,b) { return a && b && dateKey(a) === dateKey(b); }
function toIsoMonth(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

function renderCalendar() {
    calMonthLabel.textContent = monthFormatter.format(calVisibleMonth);
    calDaysContainer.innerHTML = '';
    const year = calVisibleMonth.getFullYear(), month = calVisibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < offset; i++) {
        const sp = document.createElement('span');
        sp.textContent = new Date(year, month, -offset + i + 1).getDate();
        sp.style.textAlign = 'center';
        sp.style.color = '#cbd5e1';
        sp.style.fontSize = '13px';
        calDaysContainer.appendChild(sp);
    }
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const current = new Date(year, month, day);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = day;
        if (sameDay(current, today)) btn.classList.add('today');
        if (sameDay(current, calRangeStart) || sameDay(current, calRangeEnd)) btn.classList.add('selected');
        if (calRangeStart && calRangeEnd && current > calRangeStart && current < calRangeEnd) btn.classList.add('in-range');
        if (sameDay(current, calRangeStart)) btn.classList.add('range-start');
        if (sameDay(current, calRangeEnd)) btn.classList.add('range-end');
        btn.addEventListener('click', (e) => { e.stopPropagation(); selectCalendarDate(current); });
        calDaysContainer.appendChild(btn);
    }
}

function selectCalendarDate(date) {
    if (!calRangeStart || (calRangeStart && calRangeEnd)) {
        calRangeStart = date;
        calRangeEnd = null;
        calStatus.textContent = 'Ahora selecciona la fecha final';
        calApplyBtn.disabled = true;
    } else {
        if (date < calRangeStart) { calRangeEnd = calRangeStart; calRangeStart = date; }
        else if (sameDay(date, calRangeStart)) { calRangeEnd = date; }
        else { calRangeEnd = date; }
        calStatus.textContent = `Rango: ${dateFormatter.format(calRangeStart)} - ${dateFormatter.format(calRangeEnd)}`;
        calApplyBtn.disabled = false;
    }
    updateDateLabel();
    renderCalendar();
}
function updateDateLabel() {
    if (calRangeStart && calRangeEnd) dateLabel.textContent = `${dateFormatter.format(calRangeStart)} - ${dateFormatter.format(calRangeEnd)}`;
    else if (calRangeStart && !calRangeEnd) dateLabel.textContent = `${dateFormatter.format(calRangeStart)} - ...`;
    else dateLabel.textContent = 'Rango de vencimiento';
}
function openCalendar() { calendarPopup.classList.add('open'); dateTrigger.classList.add('open'); dateTrigger.setAttribute('aria-expanded','true'); }
function closeCalendar() { calendarPopup.classList.remove('open'); dateTrigger.classList.remove('open'); dateTrigger.setAttribute('aria-expanded','false'); }
function clearCalendarRange() { calRangeStart = null; calRangeEnd = null; calPendingDesde = ""; calPendingHasta = ""; calStatus.textContent = 'Selecciona la fecha de inicio'; calApplyBtn.disabled = true; updateDateLabel(); renderCalendar(); applyFilters(); }

dateTrigger.addEventListener('click', (e) => { e.stopPropagation(); if (calendarPopup.classList.contains('open')) closeCalendar(); else openCalendar(); });
document.getElementById('cal-prev').addEventListener('click', (e) => { e.stopPropagation(); calVisibleMonth.setMonth(calVisibleMonth.getMonth() - 1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', (e) => { e.stopPropagation(); calVisibleMonth.setMonth(calVisibleMonth.getMonth() + 1); renderCalendar(); });
calClearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearCalendarRange(); });
calApplyBtn.addEventListener('click', (e) => { e.stopPropagation(); if (calRangeStart && calRangeEnd) { calPendingDesde = toIsoMonth(calRangeStart); calPendingHasta = toIsoMonth(calRangeEnd); closeCalendar(); applyFilters(); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.date-filter-wrap')) closeCalendar(); });

function getMonthIndex(dateStr) {
    const isoMonth = String(dateStr ?? "").match(/^(\d{4})-(\d{2})$/);
    if (isoMonth) { const month = Number(isoMonth[2]); if (month >= 1 && month <= 12) return Number(isoMonth[1]) * 12 + month; }
    const parsed = getMonthYear(dateStr);
    return parsed ? parsed.year * 12 + parsed.month : null;
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
//  FILTROS Y RENDER
// ============================================================
function applyFilters() {
    actualizarEstadoCondicionFilter();

    const selectedResponsable = responsableFilter.value.trim();
    const selectedNumero = (isAdmin && numeroFilter) ? numeroFilter.value.trim().toLowerCase() : "";
    const selectedDesde = isAdmin ? (calPendingDesde || "") : "";
    const selectedHasta = isAdmin ? (calPendingHasta || "") : "";
    const selectedCondicion = (isAdmin || selectedResponsable) ? condicionFilter.value : "";

    currentFilteredData = misDatos.filter(item => {
        const no = String(item["N"]);
        const responsableActual = String(item["AREA RESPONSABLE"] ?? "").trim();
        let matchResponsable = true;
        if (selectedResponsable) {
            const sel = selectedResponsable.toLowerCase();
            matchResponsable = responsableActual.toLowerCase() === sel;

            if (!matchResponsable) {
                const prest = movimientosPrestamoActivos[no];
                if (prest && String(prest.responsable_destino || '').toLowerCase() === sel) {
                    matchResponsable = true;
                }
            }
            if (!matchResponsable && item["ubicacion_prestamo"]) {
                if (item["ubicacion_prestamo"].toLowerCase().includes(`préstamo a: ${sel}`)) matchResponsable = true;
            }
        }
        if (!matchResponsable) return false;
        if (selectedNumero && !String(item["N"] ?? "").toLowerCase().includes(selectedNumero)) return false;
        if (!itemMatchesDateRange(item, selectedDesde, selectedHasta)) return false;

        const condicionActual = getCondicionItem(item);

        if (condicionActual === 'Baja' && extintoresReemplazados[no]) {
            return false;
        }

        if (!isAdmin && condicionActual === 'Baja') return false;

        if (selectedCondicion && condicionActual !== selectedCondicion) return false;
        return true;
    });

    renderTable(currentFilteredData);
    updateCounter(currentFilteredData.length, misDatos.length);
    actualizarAlertaGarantias();
}

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

function inicializarAutocompletes() {
    const respInput = document.getElementById('responsable-filter');
    const respDropdown = document.getElementById('responsable-dropdown');
    const respClear = document.getElementById('responsable-clear');

    responsableAutocomplete = crearAutocomplete({
        input: respInput,
        dropdown: respDropdown,
        clearBtn: respClear,
        getOptions: obtenerAreasResponsables,
        onSelect: () => applyFilters(),
        onInput: () => applyFilters()
    });

    const areaInput = document.getElementById('unidad-area');
    const areaDropdown = document.getElementById('unidad-area-dropdown');
    const areaClear = document.getElementById('unidad-area-clear');

    unidadAreaAutocomplete = crearAutocomplete({
        input: areaInput,
        dropdown: areaDropdown,
        clearBtn: areaClear,
        getOptions: obtenerAreasResponsables
    });
}

function updateCounter(mostrados, total) {
    counterDisplay.innerHTML = `Mostrando <strong>${mostrados}</strong> de <strong>${total}</strong> extintores`;
}

function renderTable(data) {
    tableBody.innerHTML = "";
    if (data.length === 0) {
        const cols = isAdmin ? 7 : 6;
        tableBody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center; padding:24px; color:#94a3b8;">No hay resultados.</td></tr>`;
        return;
    }
    const mostrarEstado = isAdmin;
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

        let html = `
            <td><strong>${item["N"] || "-"}</strong></td>
            <td>${item["AREA RESPONSABLE"] || "-"}</td>
            <td>${ubicacionAsignada}</td>
            <td>${ubicacionActual}</td>
            <td><span class="badge ${getBadgeClass(condicion)}">${condicion}</span></td>
            <td>${garantiaReemplazo}</td>
        `;
        if (mostrarEstado) {
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
        html += `<td>${getCondicionItem(item)}</td><td>${getEstadoItem(item)}</td><td>${getGarantiaReemplazo(item)}</td></tr>`;
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
            <div class="modal-row"><label>Condición:</label><value><span class="badge ${getBadgeClass(condicion)}">${condicion}</span></value></div>
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
            if (!prestamoActivo) {
                botonesAccion += `<button class="btn" style="background:#dc2626;color:white;" onclick="openLoanForm(${currentItemIndex})"><i class="fas fa-handshake"></i> Préstamo</button>`;
            }
            if (!garantiaActiva) {
                botonesAccion += `<button class="btn btn-garantia" onclick="openLoanFormGarantia(${currentItemIndex})"><i class="fas fa-tools"></i> Extintor de garantía</button>`;
            }
            if (prestamoActivo) {
                botonesAccion += `<button class="btn btn-primary" onclick="finalizarPrestamo(${currentItemIndex})"><i class="fas fa-check-circle"></i> Finalizar Préstamo</button>`;
            }
            if (garantiaActiva) {
                if (item["ESTADO"] === 'Extintor pendiente') {
                    botonesAccion += `<button class="btn btn-warning" onclick="marcarGarantiaRecibida(${currentItemIndex})"><i class="fas fa-truck"></i> Confirmar llegada a mantenimiento</button>`;
                }
                botonesAccion += `<button class="btn btn-success" onclick="finalizarGarantia(${currentItemIndex})"><i class="fas fa-check-circle"></i> Finalizar Garantía</button>`;
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
    document.getElementById('personal-cambio').value = '';
    document.getElementById('extintor-reemplazo').value = '';
    document.getElementById('motivo-select').value = 'Usado';
    document.getElementById('proxima-recarga').value = '';
    document.getElementById('garantia-personal').value = '';
    document.getElementById('garantia-reemplazo').value = '';
    document.getElementById('unidad-area').value = '';
    document.getElementById('unidad-responsable').value = '';
    document.getElementById('unidad-asignada').value = '';
    if (unidadAreaAutocomplete) unidadAreaAutocomplete.refrescar();
    modoGarantiaForzado = false;
    document.getElementById('tipo-prestamo-wrapper').style.display = 'block';
    document.getElementById('tipo-prestamo-fijo').style.display = 'none';
    document.getElementById('tipo-prestamo').value = 'interno';
    toggleCamposPrestamo();
    loanModal.classList.add('active');
}
function openLoanFormGarantia(itemIndex) {
    currentItemIndex = itemIndex;
    closeModal();
    document.getElementById('personal-cambio').value = '';
    document.getElementById('extintor-reemplazo').value = '';
    document.getElementById('motivo-select').value = 'Usado';
    document.getElementById('garantia-personal').value = '';
    document.getElementById('garantia-reemplazo').value = '';
    document.getElementById('unidad-area').value = '';
    document.getElementById('unidad-responsable').value = '';
    document.getElementById('unidad-asignada').value = '';
    if (unidadAreaAutocomplete) unidadAreaAutocomplete.refrescar();
    modoGarantiaForzado = true;
    document.getElementById('tipo-prestamo-wrapper').style.display = 'none';
    document.getElementById('tipo-prestamo-fijo').style.display = 'block';
    document.getElementById('tipo-prestamo').value = 'garantia';
    toggleCamposPrestamo();
    loanModal.classList.add('active');
}
function closeLoanModal() {
    modoGarantiaForzado = false;
    document.getElementById('tipo-prestamo-wrapper').style.display = 'block';
    document.getElementById('tipo-prestamo-fijo').style.display = 'none';
    loanModal.classList.remove('active');
}
function toggleCamposPrestamo() {
    const tipo = document.getElementById('tipo-prestamo').value;
    if (modoGarantiaForzado) {
        document.getElementById('campos-interno').style.display = 'none';
        document.getElementById('campos-garantia').style.display = 'block';
        document.getElementById('campos-unidad').style.display = 'none';
        return;
    }
    document.getElementById('campos-interno').style.display = tipo === 'interno' ? 'block' : 'none';
    document.getElementById('campos-garantia').style.display = tipo === 'garantia' ? 'block' : 'none';
    document.getElementById('campos-unidad').style.display = tipo === 'unidad' ? 'block' : 'none';
}

async function guardarPrestamo() {
    const tipo = document.getElementById('tipo-prestamo').value;
    if (tipo === 'interno') await guardarPrestamoInterno();
    else if (tipo === 'garantia') await guardarPrestamoGarantia();
    else if (tipo === 'unidad') await guardarPrestamoUnidad();
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

    await supabaseClient.from(TABLA_MOVIMIENTOS).insert([
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
    ]);

    await supabaseClient
        .from(TABLA_EXTINTORES)
        .update({
            observaciones: (itemA["observaciones"] || '') + `\n[Préstamo Interno ${new Date().toLocaleDateString('es-ES')}] ${motivo} - Vencía: ${fechaOriginal} → Próxima recarga: ${proximaRecarga}`
        })
        .eq('N', noA);

    await actualizarUnExtintor(noA);
    await actualizarUnExtintor(noB);
    await cargarMovimientosActivos();

    historialCompleto.push(
        { fecha: new Date().toLocaleString('es-ES'), no: noA, tipo: 'Préstamo Interno (Salida)', personal: personal, detalle: `Extintor ${noA} reportado como ${motivo} - Vencía: ${fechaOriginal} → Próxima recarga: ${proximaRecarga} - Reemplazado por ${noB}` },
        { fecha: new Date().toLocaleString('es-ES'), no: noB, tipo: 'Préstamo Interno (Entrada)', personal: personal, detalle: `Extintor ${noB} (STOCK) enviado a ${responsableOriginalA} - Reemplaza a ${noA}` }
    );

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

    const btns = loanModal.querySelectorAll('.modal-actions .btn');
    const saveBtn = btns[0];
    const textoOriginal = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const detalle = `Garantía - Personal: ${personal} - Extintor reemplazo: ${reemplazo}`;
        const updateEstado = { ESTADO: 'Extintor pendiente' };
        const fecha = new Date().toLocaleString('es-ES');

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
        const updateData = { ESTADO: 'Garantía - Recibido' };

        const [updateRes, insertRes] = await Promise.all([
            supabaseClient.from(TABLA_EXTINTORES).update(updateData).eq('N', no),
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
        if (idx !== -1) misDatos[idx] = { ...misDatos[idx], ...updateData };

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
    const detalle = `Préstamo a unidad - Área: ${area} - Responsable: ${responsable} - Unidad: ${unidad}`;

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
            reemplazo: null,
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

        const [updateExtintor, desactivarMov] = await Promise.all([
            supabaseClient
                .from(TABLA_EXTINTORES)
                .update({
                    "F. VENC.": nuevaFecha,
                    ESTADO: null,
                    proxima_recarga: null
                })
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
        delete movimientosActivos[no];

        historialCompleto.push({
            fecha: new Date().toLocaleString('es-ES'),
            no: no,
            tipo: 'Garantía finalizada',
            personal: 'Sistema',
            detalle: `Garantía finalizada - Nuevo vencimiento: ${nuevaFecha}`
        });

        closeModal();
        applyFilters();

        await showGenericModal(`Garantía finalizada. Nuevo vencimiento: ${nuevaFecha}`, 'Éxito');

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

    if (esPrestamoInterno) {
        const fechaIngresada = await showPromptModal(
            'Ingrese la fecha REAL de recarga (MM/AAAA). Se guardará como nuevo vencimiento.',
            'Fecha real de recarga',
            item["F. VENC."] || ''
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

    let noRelacionado = prestamo.reemplazo || null;
    const numerosAFinalizar = [no];
    if (noRelacionado) numerosAFinalizar.push(noRelacionado);

    for (const num of numerosAFinalizar) {
        const { error: movError } = await supabaseClient
            .from(TABLA_MOVIMIENTOS)
            .update({ activo: false })
            .eq('n_extintor', num)
            .in('tipo', ['prestamo_interno', 'prestamo_unidad'])
            .eq('activo', true);
        if (movError) console.error(`Error desactivando préstamo para ${num}:`, movError);

        const updateData = {
            ubicacion_prestamo: null,
            ESTADO: null
        };
        if (num === no) {
            updateData.proxima_recarga = null;
            if (nuevaFechaReal) {
                updateData["F. VENC."] = nuevaFechaReal;
            }
        }

        const { error: updateError } = await supabaseClient
            .from(TABLA_EXTINTORES)
            .update(updateData)
            .eq('N', num);
        if (updateError) console.error(`Error actualizando extintor ${num}:`, updateError);
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
        detalle: `Préstamo finalizado${nuevaFechaReal ? ` - Nuevo vencimiento: ${nuevaFechaReal}` : ''}${noRelacionado ? ` - Extintor ${noRelacionado}` : ''}`
    });

    await showGenericModal('Préstamo finalizado correctamente.' + (nuevaFechaReal ? ` Nuevo vencimiento: ${nuevaFechaReal}` : ''), 'Éxito');
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
            const confirmar = await showGenericModal(
                `El número "${numeroNuevo}" lo ocupa un extintor DADO DE BAJA.\n\n` +
                `¿Deseas reutilizar ese número para el nuevo? El extintor viejo se ` +
                `renombrará a "${numeroNuevo}-BAJA-<fecha>" para conservar su historial.`,
                'Reutilizar número',
                'Sí, reutilizar',
                'No, cancelar'
            );
            if (!confirmar) return;

            const sufijo = `-BAJA-${new Date().toISOString().slice(0, 10)}`;
            const nombreViejo = `${numeroNuevo}${sufijo}`;

            const { error: renombrarErr } = await supabaseClient
                .from(TABLA_EXTINTORES)
                .update({ N: nombreViejo })
                .eq('N', numeroNuevo);

            if (renombrarErr) {
                console.error('Error renombrando extintor viejo:', renombrarErr);
                await showGenericModal(
                    'No se pudo liberar el número: ' + renombrarErr.message,
                    'Error'
                );
                return;
            }

            await Promise.all([
                supabaseClient
                    .from(TABLA_MOVIMIENTOS)
                    .update({ n_extintor: nombreViejo })
                    .eq('n_extintor', numeroNuevo),
                supabaseClient
                    .from(TABLA_OBSERVACIONES)
                    .update({ n_extintor: nombreViejo })
                    .eq('n_extintor', numeroNuevo)
            ]);

            if (extintorBajaOrigen) {
                extintorBajaOrigen.N = nombreViejo;
            }

            console.log(`🔓 Número "${numeroNuevo}" liberado. El extintor viejo ahora es "${nombreViejo}".`);

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
function abrirBaja() {
    if (!isAdmin || currentItemIndex === null) return;
    const item = misDatos[currentItemIndex];
    document.getElementById('baja-numero').value = item["N"];
    document.getElementById('baja-motivo').value = '';
    document.getElementById('baja-archivo').value = '';
    document.getElementById('baja-preview').style.display = 'none';
    document.getElementById('baja-preview').innerHTML = '';
    document.getElementById('baja-file-name').textContent = '';
    bajaArchivo = null;
    document.getElementById('baja-modal').classList.add('active');
    closeEditorModal();
}
function closeBajaModal() { document.getElementById('baja-modal').classList.remove('active'); bajaArchivo = null; }

function previewEvidenciaBaja(input) {
    const file = input.files[0];
    if (!file) return;
    bajaArchivo = file;
    const preview = document.getElementById('baja-preview');
    const fileName = document.getElementById('baja-file-name');
    fileName.textContent = `Archivo seleccionado: ${file.name}`;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Vista previa">`;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);

    } else if (file.type === 'application/pdf') {
        const url = URL.createObjectURL(file);
        preview.innerHTML = `<iframe src="${url}" style="width:100%; height:420px; border:none; border-radius:8px;"></iframe>`;
        preview.style.display = 'block';

    } else {
        preview.innerHTML = `<p style="color:#475569;">📄 ${file.name}</p>`;
        preview.style.display = 'block';
    }
}

async function confirmarBaja() {
    if (!isAdmin || currentItemIndex === null) return;

    const item = misDatos[currentItemIndex];
    const no = String(item["N"]);
    const motivo = document.getElementById('baja-motivo').value.trim() || 'Sin motivo especificado';
    const archivo = bajaArchivo;
    let evidenciaUrl = null;

    const confirmBtn = document.querySelector('#baja-modal .btn-danger');
    const textoOriginal = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando…';

    try {
        if (archivo) {
            const fileExt = (archivo.name.split('.').pop() || 'bin').toLowerCase();
            const fileName = `baja_${no}_${Date.now()}.${fileExt}`;

            const { error: uploadErr } = await supabaseClient
                .storage
                .from(BUCKET_NAME)
                .upload(`bajas/${fileName}`, archivo, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: archivo.type
                });

            if (uploadErr) throw new Error('Error al subir la evidencia: ' + uploadErr.message);

            const { data: urlData } = supabaseClient
                .storage
                .from(BUCKET_NAME)
                .getPublicUrl(`bajas/${fileName}`);

            evidenciaUrl = urlData?.publicUrl || null;
        }

        const updateData = {
            CONDICION: 'Baja',
            ESTADO: 'No Disponible',
            ubicacion_prestamo: null,
            observaciones: (item["observaciones"] || '') +
                `\n[Baja] ${motivo}${evidenciaUrl ? ' - Evidencia: ' + evidenciaUrl : ''}`,
            evidencia: evidenciaUrl || ''
        };

        const detalleMov = `Baja - Motivo: ${motivo}${evidenciaUrl ? ' - Evidencia: ' + evidenciaUrl : ''}`;

        const [updateRes, insertRes] = await Promise.all([
            supabaseClient.from(TABLA_EXTINTORES).update(updateData).eq('N', no),
            supabaseClient.from(TABLA_MOVIMIENTOS)
                .insert({ n_extintor: no, tipo: 'baja', personal: 'Sistema', detalle: detalleMov, activo: false })
                .select()
                .single()
        ]);

        if (updateRes.error) throw new Error('Error al dar de baja: ' + updateRes.error.message);
        if (insertRes.error) throw new Error('Error al registrar movimiento: ' + insertRes.error.message);

        const idx = misDatos.findIndex(x => String(x.N) === no);
        if (idx !== -1) misDatos[idx] = { ...misDatos[idx], ...updateData };

        historialCompleto.unshift({
            id: insertRes.data?.id,
            fecha: new Date().toLocaleString('es-ES'),
            no: no,
            tipo: 'Baja',
            personal: 'Sistema',
            detalle: detalleMov
        });

        closeBajaModal();
        applyFilters();

        await showGenericModal('Extintor dado de baja correctamente.', 'Éxito');

    } catch (err) {
        console.error(err);
        await showGenericModal(err.message || 'Error inesperado.', 'Error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = textoOriginal;
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
            const confirmar = await showGenericModal(
                `El número "${numeroNuevo}" lo ocupa un extintor DADO DE BAJA.\n\n` +
                `¿Deseas reutilizar ese número para el nuevo? El extintor viejo se ` +
                `renombrará a "${numeroNuevo}-BAJA" para conservar su historial.`,
                'Reutilizar número',
                'Sí, reutilizar',
                'No, cancelar'
            );
            if (!confirmar) return;

            const sufijo = `-BAJA-${new Date().toISOString().slice(0, 10)}`;
            const nombreViejo = `${numeroNuevo}${sufijo}`;

            const { error: renombrarErr } = await supabaseClient
                .from(TABLA_EXTINTORES)
                .update({ N: nombreViejo })
                .eq('N', numeroNuevo);

            if (renombrarErr) {
                console.error('Error renombrando extintor viejo:', renombrarErr);
                await showGenericModal(
                    'No se pudo liberar el número: ' + renombrarErr.message,
                    'Error'
                );
                return;
            }

            await Promise.all([
                supabaseClient
                    .from(TABLA_MOVIMIENTOS)
                    .update({ n_extintor: nombreViejo })
                    .eq('n_extintor', numeroNuevo),
                supabaseClient
                    .from(TABLA_OBSERVACIONES)
                    .update({ n_extintor: nombreViejo })
                    .eq('n_extintor', numeroNuevo)
            ]);

            if (extintorBajaOrigen) {
                extintorBajaOrigen.N = nombreViejo;
            }

            console.log(`🔓 Número "${numeroNuevo}" liberado. El extintor viejo ahora es "${nombreViejo}".`);

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
//  CARGA DE DATOS
// ============================================================
async function cargarDatosSecundarios() {
    const [{ data: observaciones, error: obsErr }, { data: movimientos, error: movErr }] = await Promise.all([
        supabaseClient.from(TABLA_OBSERVACIONES).select('*').order('created_at', { ascending: false }),
        supabaseClient.from(TABLA_MOVIMIENTOS).select('*').order('created_at', { ascending: false })
    ]);
    if (obsErr) console.error(obsErr);
    else observacionesPublicas = (observaciones || []).map(o => ({ id: o.id, no: o.n_extintor, texto: o.texto, fecha: new Date(o.created_at).toLocaleDateString('es-ES') }));
    if (movErr) { console.error(movErr); return; }
    movimientosActivos = {};
    movimientosPrestamoActivos = {};
    movimientosGarantiaActivos = {};
    historialCompleto = [];
    extintoresReemplazados = {};
    (movimientos || []).forEach(mov => {

        if (mov.tipo === 'reemplazo_baja' && mov.reemplazo) {
            extintoresReemplazados[String(mov.reemplazo)] = String(mov.n_extintor);
        }
        const fecha = new Date(mov.created_at).toLocaleString('es-ES');
        let tipoTexto = '';
        if (mov.tipo === 'prestamo_unidad') tipoTexto = 'Préstamo a unidad';
        else if (mov.tipo === 'prestamo_interno') tipoTexto = 'Préstamo Interno';
        else if (mov.tipo === 'retorno') tipoTexto = 'Retorno';
        else if (mov.tipo === 'baja') tipoTexto = 'Baja';
        else if (mov.tipo === 'garantia') tipoTexto = 'Garantía';
        else if (mov.tipo === 'reemplazo_baja') tipoTexto = 'Reemplazo de baja';
        else tipoTexto = 'Otro';
        historialCompleto.push({
            id: mov.id,
            fecha: fecha,
            no: mov.n_extintor,
            tipo: tipoTexto,
            personal: mov.personal || '-',
            detalle: mov.detalle || (mov.tipo === 'prestamo_interno' ? `Reemplazo: ${mov.reemplazo || '-'}` : '')
        });
        if (mov.activo) {
            movimientosActivos[mov.n_extintor] = { tipo: mov.tipo, personal: mov.personal, motivo: mov.motivo, reemplazo: mov.reemplazo, responsable_destino: mov.responsable_destino, ubicacion_destino: mov.ubicacion_destino, fecha: fecha };
            if (mov.tipo === 'prestamo_interno' || mov.tipo === 'prestamo_unidad') {
                movimientosPrestamoActivos[mov.n_extintor] = { tipo: mov.tipo, personal: mov.personal, motivo: mov.motivo, reemplazo: mov.reemplazo, responsable_destino: mov.responsable_destino, ubicacion_destino: mov.ubicacion_destino, fecha: fecha };
            } else if (mov.tipo === 'garantia') {
                movimientosGarantiaActivos[mov.n_extintor] = { reemplazo: mov.reemplazo, personal: mov.personal, fecha: fecha };
            }
        }
    });
}

async function refreshData() {
    const { data, error } = await supabaseClient.from(TABLA_EXTINTORES).select('*');
    if (error) { console.error(error); return; }
    if (data) misDatos = [...data].sort(compararNumeros);
}

// ============================================================
//  INICIO
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
        tableBody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}" style="text-align:center; color:#ef4444;">Error de Supabase: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}" style="text-align:center; color:#94a3b8;">La tabla de Supabase está vacía o no tiene registros</td></tr>`;
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

    poblarResponsables();
    inicializarAutocompletes();
    renderCalendar();
    applyFilters();
}

// Eventos para cerrar modales con clic fuera
detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeModal(); });
loanModal.addEventListener('click', (e) => { if (e.target === loanModal) closeLoanModal(); });
historyModal.addEventListener('click', (e) => { if (e.target === historyModal) closeHistoryModal(); });
observationsModal.addEventListener('click', (e) => { if (e.target === observationsModal) closeObservationsModal(); });
observationFormModal.addEventListener('click', (e) => { if (e.target === observationFormModal) closeObservationFormModal(); });
editorModal.addEventListener('click', (e) => { if (e.target === editorModal) closeEditorModal(); });
document.getElementById('baja-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeBajaModal(); });
document.getElementById('nuevo-reemplazo-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeNuevoReemplazoModal(); });
document.getElementById('garantias-pendientes-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGarantiasPendientesModal(); });
condicionFilter.addEventListener('change', applyFilters);
if (numeroFilter) numeroFilter.addEventListener('input', applyFilters);
iniciarApp();
