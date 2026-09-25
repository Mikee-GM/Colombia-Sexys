import { useState, useMemo } from "react";
import { formatCurrency } from "../../utils/calculations";
import "./CutComparisonTable.css";

export default function CutComparisonTable({
    officeRecords = [],
    employeeRecords = [],
    onEdit,
    onDelete,
    onDuplicateToEmployee,
    onDuplicateToOffice
}) {
    const [galleryState, setGalleryState] = useState({
        isOpen: false,
        images: [],
        currentIndex: 0
    });

    // --- ALGORITMO DE EMPAREJAMIENTO INTELIGENTE ---
    const { rows, multas, cargos } = useMemo(() => {
        const safeOffice = Array.isArray(officeRecords) ? officeRecords : [];
        const safeEmployee = Array.isArray(employeeRecords) ? employeeRecords : [];

        // Extraer multas
        const multas = safeOffice.filter(r => r.es_multa).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // Extraer cargos (solo de officeRecords para evitar duplicados en la sección visual)
        const cargos = safeOffice.filter(r => r.es_cargo).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // Filtrar registros normales
        // ORDEN: Más antiguo arriba, más reciente hasta abajo (ascendente)
        const regularOffice = safeOffice.filter(r => !r.es_multa && !r.es_cargo).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        const regularEmployee = safeEmployee.filter(r => !r.es_multa && !r.es_cargo);

        const matchedRows = [];
        const unmatchedOffice = [];
        const unmatchedEmployee = [];

        const possibleMatches = [];

        const getBanksList = (r) => {
            return [r.banco, r.banco_2, r.banco_3, r.banco_4, r.banco_5]
                .filter(b => b && b.trim() !== "")
                .map(b => b.toLowerCase().trim());
        };

        const isSameDay = (d1, d2) => {
            const date1 = new Date(d1);
            const date2 = new Date(d2);
            return date1.getDate() === date2.getDate() &&
                date1.getMonth() === date2.getMonth() &&
                date1.getFullYear() === date2.getFullYear();
        };

        regularOffice.forEach((oRec, oIndex) => {
            regularEmployee.forEach((eRec, eIndex) => {
                let currentScore = 0;
                let methodScore = 0;
                let totalScore = 0;

                // 1. FACTOR PRIMARIO: MÉTODO DE PAGO (40 pts)
                const m1 = String(oRec.metodo_pago || "").trim().toLowerCase();
                const m2 = String(eRec.metodo_pago || "").trim().toLowerCase();
                const banks1 = getBanksList(oRec);
                const banks2 = getBanksList(eRec);

                if (m1 === m2 && m1 !== "") {
                    methodScore = 40;
                } else {
                    const matchesAnyBank = banks1.some(b => banks2.includes(b));
                    if (matchesAnyBank) methodScore = 35;
                    else if (
                        (m1 === "tarjeta" && (banks2.length > 0 || m2 === "transferencia")) ||
                        (m2 === "tarjeta" && (banks1.length > 0 || m1 === "transferencia")) ||
                        (m1 === "mixto" && (banks2.length > 0 || m2 !== "efectivo"))
                    ) {
                        methodScore = 25;
                    }
                }

                // 2. FACTOR PRIMARIO: TOTAL SERVICIO (40 pts)
                const diffPrice = Math.abs((Number(oRec.total_servicio) || 0) - (Number(eRec.total_servicio) || 0));
                if (diffPrice < 1.0) totalScore = 40;
                else if (diffPrice < 10.0) totalScore = 20;
                else if (diffPrice < 50.0) totalScore = 5; // Margen pequeño para ajustes menores
                else totalScore = -100; // PENALIZACIÓN CRÍTICA: Montos muy distintos no se juntan

                currentScore = methodScore + totalScore;

                // 3. PRIORIDAD MEDIA: EXTRAS Y TRANSPORTE (10 pts c/u)
                const diffExtra = Math.abs((Number(oRec.extra) || 0) - (Number(eRec.extra) || 0));
                if (diffExtra < 1.0) currentScore += 10;

                const diffTransp = Math.abs((Number(oRec.gasto_transporte_empresa) || 0) - (Number(eRec.gasto_transporte_empresa) || 0));
                if (diffTransp < 1.0) currentScore += 10;

                // 4. PRIORIDAD BAJA: LUGAR Y FECHA (5 pts c/u)
                const place1 = (oRec.lugar || "").trim().toLowerCase();
                const place2 = (eRec.lugar || "").trim().toLowerCase();
                if (place1 && place2 && (place1 === place2 || place1.includes(place2) || place2.includes(place1))) {
                    currentScore += 5;
                }

                const timeDiff = Math.abs(new Date(eRec.fecha) - new Date(oRec.fecha));
                if (isSameDay(oRec.fecha, eRec.fecha)) {
                    currentScore += 3;
                    if (timeDiff < 1000 * 60 * 60 * 4) currentScore += 2; // Menos de 4 horas
                }

                // UMBRAL DE CONFIANZA: 55 pts asegura que al menos ambos factores primarios tengan coincidencia
                if (currentScore >= 55) {
                    possibleMatches.push({ oIndex, eIndex, oRec, eRec, score: currentScore, timeDiff });
                }
            });
        });

        // Ordenar coincidencias de mayor a menor puntuación, y luego por menor diferencia de tiempo
        possibleMatches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.timeDiff - b.timeDiff;
        });

        const usedO = new Set();
        const usedE = new Set();

        possibleMatches.forEach(match => {
            if (!usedO.has(match.oIndex) && !usedE.has(match.eIndex)) {
                matchedRows.push({ office: match.oRec, employee: match.eRec, type: 'match' });
                usedO.add(match.oIndex);
                usedE.add(match.eIndex);
            }
        });

        // Los registros de oficina que no se emparejaron
        regularOffice.forEach((oRec, oIndex) => {
            if (!usedO.has(oIndex)) {
                unmatchedOffice.push({ office: oRec, employee: null, type: 'office_orphan' });
            }
        });

        // Los registros de empleada que no se emparejaron
        regularEmployee.forEach((eRec, eIndex) => {
            if (!usedE.has(eIndex)) {
                unmatchedEmployee.push({ office: null, employee: eRec, type: 'employee_orphan' });
            }
        });

        // Ordenar para la visualización
        matchedRows.sort((a, b) => new Date(a.office.fecha) - new Date(b.office.fecha));
        unmatchedEmployee.sort((a, b) => new Date(a.employee.fecha) - new Date(b.employee.fecha));

        const allRows = [...matchedRows, ...unmatchedOffice, ...unmatchedEmployee];
        let officeCounter = 0;
        let employeeCounter = 0;

        const rowsWithCounters = allRows.map(row => {
            if (row.office) officeCounter++;
            if (row.employee) employeeCounter++;
            return {
                ...row,
                oIdx: row.office ? officeCounter : null,
                eIdx: row.employee ? employeeCounter : null
            };
        });

        return {
            rows: rowsWithCounters,
            multas,
            cargos
        };
    }, [officeRecords, employeeRecords]);

    // --- HELPERS ---
    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        const d = new Date(dateString);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const formatValue = (val, type, rec) => {
        if (!val || Number(val) === 0) return '-';
        if (type === 'currency') return formatCurrency(Number(val));
        if (type === 'date') return formatDateTime(val);
        if (type === 'metodo') {
            const v = String(val || '').toLowerCase();
            const bancos = [rec.banco, rec.banco_2, rec.banco_3, rec.banco_4, rec.banco_5].filter(b => b && b.trim() !== "");
            if (bancos.length > 0) return v.includes('mixto') ? `Mixto (${bancos.join(', ')})` : bancos.join(', ');
            return val;
        }
        return val;
    };

    const isMatchExact = (val1, val2, type, rec1, rec2) => {
        if (!rec1 || !rec2) return false;

        if (type === 'metodo') {
            const m1 = String(val1 || '').toLowerCase();
            const m2 = String(val2 || '').toLowerCase();
            if (m1 === m2) return true;

            const banks1 = [rec1.banco, rec1.banco_2, rec1.banco_3, rec1.banco_4, rec1.banco_5].filter(b => b && b.trim() !== "").map(b => b.toLowerCase().trim());
            const banks2 = [rec2.banco, rec2.banco_2, rec2.banco_3, rec2.banco_4, rec2.banco_5].filter(b => b && b.trim() !== "").map(b => b.toLowerCase().trim());

            if (m1 === 'tarjeta' && banks2.length > 0) return true;
            if (m2 === 'tarjeta' && banks1.length > 0) return true;
            if (m1 === 'mixto' && banks2.length > 0) return true;
            if (m2 === 'mixto' && banks1.length > 0) return true;
            return false;
        }

        if (type === 'currency') {
            return Math.abs((Number(val1) || 0) - (Number(val2) || 0)) < 1.0;
        }

        return String(val1 || '').trim().toLowerCase() === String(val2 || '').trim().toLowerCase();
    };

    const renderCell = (val1, val2, type, record1, record2, strictCheck = false) => {
        if (!record1 || !record2) {
            return {
                content1: record1 ? formatValue(val1, type, record1) : '-',
                content2: record2 ? formatValue(val2, type, record2) : '-',
                isMismatch: false
            };
        }
        const c1 = formatValue(val1, type, record1);
        const c2 = formatValue(val2, type, record2);

        const mismatch = !isMatchExact(val1, val2, type, record1, record2);
        return { content1: c1, content2: c2, isMismatch: strictCheck && mismatch };
    };

    // --- ACTIONS ---
    const openGallery = (urls) => {
        if (urls && urls.length > 0) {
            setGalleryState({ isOpen: true, images: urls, currentIndex: 0 });
        }
    };

    const nextImage = (e) => {
        e.stopPropagation();
        setGalleryState(prev => ({ ...prev, currentIndex: (prev.currentIndex + 1) % prev.images.length }));
    };

    const prevImage = (e) => {
        e.stopPropagation();
        setGalleryState(prev => ({ ...prev, currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length }));
    };

    // Render STATUS
    const renderStatus = (record) => {
        if (!record || !record._id) return null;
        const hasPhotos = record.comprobanteUrls && record.comprobanteUrls.length > 0;

        return (
            <div className="status-cell">
                <div style={{ display: 'flex', gap: '5px', marginBottom: '4px' }}>
                    {record.cancelado && <span className="tag tag-cancel">CANCEL</span>}
                    {record.promocion && <span className="tag tag-promo">PROMO</span>}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {hasPhotos && (
                        <span
                            className="btn-link"
                            onClick={(e) => { e.stopPropagation(); openGallery(record.comprobanteUrls); }}
                        >
                            {record.comprobanteUrls.length > 1 ? `FOTOS (${record.comprobanteUrls.length})` : 'FOTO'}
                        </span>
                    )}

                    {onDelete && (
                        <button
                            className="btn-icon-delete"
                            title="Eliminar Registro"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(record._id);
                            }}
                        >
                            🗑️
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const handleRowClick = (record) => {
        if (record && record._id && onEdit) onEdit(record);
    };

    return (
        <>
            <div className="comparison-container fade-in">
                <div className="table-header-title">
                    <h3>Comparativa Inteligente</h3>
                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '5px' }}>
                        <span>✅ Arriba: Coincidencias</span> |
                        <span style={{ marginLeft: '10px' }}>⚠️ Rojo: Diferencias en dinero/método</span>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="comparison-table">
                        <colgroup>
                            {/* OFICINA (12 columnas) */}
                            <col style={{ width: '30px' }} />  {/* # */}
                            <col style={{ width: '60px' }} />  {/* Folio */}
                            <col style={{ width: '85px' }} />  {/* Total */}
                            <col style={{ width: '75px' }} />  {/* Extra */}
                            <col style={{ width: '75px' }} />  {/* Transp. */}
                            <col style={{ width: '110px' }} /> {/* Método */}
                            <col style={{ width: '100px' }} /> {/* Lugar */}
                            <col style={{ width: '100px' }} /> {/* Fecha */}
                            <col style={{ width: '110px' }} /> {/* Inició (Nombre Jefe) */}
                            <col style={{ width: '150px' }} /> {/* Obs */}
                            <col style={{ width: '100px' }} /> {/* Info (Status/Tags) */}
                            <col style={{ width: '90px' }} />  {/* Acción */}

                            {/* SEPARADOR (1 columna) */}
                            <col style={{ width: '15px' }} />

                            {/* EMPLEADA (11 columnas) */}
                            <col style={{ width: '30px' }} />  {/* # */}
                            <col style={{ width: '60px' }} />  {/* Folio */}
                            <col style={{ width: '85px' }} />  {/* Total */}
                            <col style={{ width: '75px' }} />  {/* Extra */}
                            <col style={{ width: '75px' }} />  {/* Transp. */}
                            <col style={{ width: '110px' }} /> {/* Método */}
                            <col style={{ width: '100px' }} /> {/* Lugar */}
                            <col style={{ width: '100px' }} /> {/* Fecha */}
                            <col style={{ width: '150px' }} /> {/* Obs */}
                            <col style={{ width: '100px' }} /> {/* Info */}
                            <col style={{ width: '90px' }} />  {/* Acción */}
                        </colgroup>
                        <thead>
                            <tr>
                                <th colSpan="12" className="header-office">REGISTROS OFICINA / JEFE</th>
                                <th className="separator-col"></th>
                                <th colSpan="11" className="header-employee">REGISTROS EMPLEADA</th>
                            </tr>
                            <tr className="sub-header">
                                <th style={{ color: '#666' }}>#</th> <th>Folio</th> <th>Total</th> <th>Extra</th> <th>Transp.</th> <th>Método</th> <th>Lugar</th> <th>Fecha</th> <th>Inició</th> <th>Obs</th> <th>Info</th>
                                <th style={{ textAlign: 'center' }}>Acción</th>
                                <th className="separator-col"></th>
                                <th style={{ color: '#666' }}>#</th> <th>Folio</th> <th>Total</th> <th>Extra</th> <th>Transp.</th> <th>Método</th> <th>Lugar</th> <th>Fecha</th> <th>Obs</th> <th>Info</th>
                                <th style={{ textAlign: 'center' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan="21" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No hay registros para comparar.</td></tr>
                            ) : rows.map((row, i) => {
                                const oRec = row.office;
                                const eRec = row.employee;
                                const isOrphan = !oRec || !eRec;

                                const folioO = oRec ? `#${oRec._id ? oRec._id.toString().slice(-4).toUpperCase() : '----'}` : null;
                                const folioE = eRec ? `#${eRec._id ? eRec._id.toString().slice(-4).toUpperCase() : '----'}` : null;

                                const numServ = renderCell(folioO, folioE, 'text', oRec, eRec, false);

                                const total = renderCell(oRec?.total_servicio, eRec?.total_servicio, 'currency', oRec, eRec, true);
                                const extra = renderCell(oRec?.extra, eRec?.extra, 'currency', oRec, eRec, true);

                                const transporte = renderCell(oRec?.gasto_transporte_empresa, eRec?.gasto_transporte_empresa, 'currency', oRec, eRec, false);

                                const metodo = renderCell(oRec?.metodo_pago, eRec?.metodo_pago, 'metodo', oRec, eRec, true);
                                const lugar = renderCell(oRec?.lugar, eRec?.lugar, 'text', oRec, eRec, false);
                                const fechaValO = oRec?.fecha_creacion || oRec?.fecha;
                                const fechaValE = eRec?.fecha_creacion || eRec?.fecha;
                                const fecha = renderCell(fechaValO, fechaValE, 'date', oRec, eRec, false);

                                const obsO = oRec?.observaciones || '-';
                                const obsE = eRec?.observaciones || '-';
                                const emptyO = !oRec ? 'empty-slot' : '';
                                const emptyE = !eRec ? 'empty-slot' : '';

                                const prevRowType = i > 0 ? rows[i - 1].type : null;
                                const showSeparator = i > 0 && row.type !== 'match' && prevRowType === 'match';

                                return (
                                    <tr key={i} className={`data-row ${isOrphan ? 'row-orphan' : ''}`} style={showSeparator ? { borderTop: '2px solid #555' } : {}}>
                                        {/* --- COLUMNAS OFICINA --- */}
                                        <td className={emptyO} style={{ textAlign: 'center', backgroundColor: '#0a0a0a', color: '#555', fontSize: '10px' }}>
                                            {row.oIdx}
                                        </td>
                                        <td className={`${emptyO} font-bold`} onClick={() => handleRowClick(oRec)}>
                                            <span className="text-[var(--accent-gold)] font-black tracking-wider">{numServ.content1}</span>
                                        </td>
                                        <td className={`${emptyO} ${total.isMismatch ? 'diff' : ''}`} onClick={() => handleRowClick(oRec)}>{total.content1}</td>
                                        <td className={`${emptyO} ${extra.isMismatch ? 'diff' : ''}`} onClick={() => handleRowClick(oRec)}>{extra.content1}</td>
                                        <td className={emptyO} onClick={() => handleRowClick(oRec)} style={{ color: '#ffffff' }}>{transporte.content1}</td>
                                        <td className={`${emptyO} ${metodo.isMismatch ? 'diff' : ''}`} onClick={() => handleRowClick(oRec)} style={{ fontSize: '0.7rem' }}>{metodo.content1}</td>
                                        <td className={emptyO} onClick={() => handleRowClick(oRec)}>{lugar.content1}</td>
                                        <td className={emptyO} onClick={() => handleRowClick(oRec)} style={{ fontSize: '0.7rem' }}>{fecha.content1}</td>
                                        <td className={emptyO} onClick={() => handleRowClick(oRec)} style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={oRec?.nombre_registrador}>
                                            {oRec?.nombre_registrador || '-'}
                                        </td>
                                        <td className={`${emptyO} obs-cell`} onClick={() => handleRowClick(oRec)} title={obsO}>{obsO}</td>
                                        <td className={emptyO}>{renderStatus(oRec)}</td>

                                        {/* ACCIÓN OFICINA -> Botón de Duplicar hacia Empleada si es Huérfano */}
                                        <td className={emptyO} style={{ textAlign: 'center', padding: '4px' }}>
                                            {oRec && !eRec && onDuplicateToEmployee && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDuplicateToEmployee(oRec); }}
                                                    title="Copiar este registro hacia la Empleada"
                                                    style={{ backgroundColor: 'var(--accent-gold)', color: 'black', fontWeight: 'bold', fontSize: '9px', padding: '4px 6px', borderRadius: '4px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    Copia ➔ Emp
                                                </button>
                                            )}
                                        </td>

                                        <td className="separator-col"></td>

                                        {/* --- COLUMNAS EMPLEADA --- */}
                                        <td className={emptyE} style={{ textAlign: 'center', backgroundColor: '#0a0a0a', color: '#555', fontSize: '10px' }}>
                                            {row.eIdx}
                                        </td>
                                        <td className={`${emptyE} text-[var(--accent-gold)] font-black tracking-wider`} onClick={() => handleRowClick(eRec)}>{numServ.content2}</td>
                                        <td className={`${emptyE} ${total.isMismatch ? 'diff' : ''}`} onClick={() => handleRowClick(eRec)}>{total.content2}</td>
                                        <td className={`${emptyE} ${extra.isMismatch ? 'diff' : ''}`} onClick={() => handleRowClick(eRec)}>{extra.content2}</td>
                                        <td className={emptyE} onClick={() => handleRowClick(eRec)} style={{ color: '#ffffff' }}>{transporte.content2}</td>
                                        <td className={`${emptyE} ${metodo.isMismatch ? 'diff' : ''}`} onClick={() => handleRowClick(eRec)} style={{ fontSize: '0.7rem' }}>{metodo.content2}</td>
                                        <td className={emptyE} onClick={() => handleRowClick(eRec)}>{lugar.content2}</td>
                                        <td className={emptyE} onClick={() => handleRowClick(eRec)} style={{ fontSize: '0.7rem' }}>{fecha.content2}</td>
                                        <td className={`${emptyE} obs-cell`} onClick={() => handleRowClick(eRec)} title={obsE}>{obsE}</td>
                                        <td className={emptyE}>{renderStatus(eRec)}</td>

                                        {/* ACCIÓN EMPLEADA -> Botón de Importar hacia Oficina si es Huérfano */}
                                        <td className={emptyE} style={{ textAlign: 'center', padding: '4px' }}>
                                            {!oRec && eRec && onDuplicateToOffice && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDuplicateToOffice(eRec); }}
                                                    title="Importar este registro a la Oficina"
                                                    style={{ backgroundColor: '#222', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', fontWeight: 'bold', fontSize: '9px', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    + Importar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SECCIÓN ESPECIAL PARA MULTAS */}
            {multas && multas.length > 0 && (
                <div style={{ marginTop: '30px', backgroundColor: '#121212', borderRadius: '10px', border: '1px solid #ff453a', overflow: 'hidden' }}>
                    <div style={{ padding: '15px', backgroundColor: 'rgba(255,69,58,0.1)', borderBottom: '1px solid rgba(255,69,58,0.3)' }}>
                        <h3 style={{ margin: 0, color: '#ff453a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '24px', backgroundColor: '#ff453a', borderRadius: '4px', display: 'inline-block' }}></span>
                            MULTAS APLICADAS ({multas.length})
                        </h3>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', color: '#aaa' }}>Estas multas ya están afectando el corte financiero de la empleada.</p>
                    </div>
                    <div style={{ padding: '15px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        {multas.map(m => (
                            <div key={m._id} style={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px', padding: '15px', flex: '1 1 250px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                            {new Date(m.fecha).toLocaleDateString('es-MX')}
                                        </span>
                                        <span style={{ fontSize: '1.2rem', color: '#ff453a', fontWeight: 'bold' }}>
                                            -{formatCurrency(m.monto_multa)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#ddd', fontStyle: 'italic' }}>
                                        "{m.concepto_multa}"
                                    </p>
                                </div>
                                <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase' }}>
                                        Registrado por: {m.nombre_registrador || 'Admin'}
                                    </span>
                                    {onDelete && (
                                        <button
                                            onClick={() => onDelete(m._id)}
                                            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '5px' }}
                                            title="Eliminar Multa"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SECCIÓN ESPECIAL PARA CARGOS A EMPRESA */}
            {cargos && cargos.length > 0 && (
                <div style={{ marginTop: '20px', backgroundColor: '#121212', borderRadius: '10px', border: '1px solid #92400e', overflow: 'hidden' }}>
                    <div style={{ padding: '15px', backgroundColor: 'rgba(245,158,11,0.07)', borderBottom: '1px solid rgba(245,158,11,0.25)' }}>
                        <h3 style={{ margin: 0, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '24px', backgroundColor: '#fbbf24', borderRadius: '4px', display: 'inline-block' }}></span>
                            CARGOS A EMPRESA ({cargos.length})
                        </h3>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', color: '#aaa' }}>Estos cargos suman a favor de la empresa en ambos cortes.</p>
                    </div>
                    <div style={{ padding: '15px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        {cargos.map(c => (
                            <div key={c._id} style={{ backgroundColor: '#000', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '15px', flex: '1 1 250px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                            {new Date(c.fecha).toLocaleDateString('es-MX')}
                                        </span>
                                        <span style={{ fontSize: '1.2rem', color: '#fbbf24', fontWeight: 'bold' }}>
                                            +{formatCurrency(c.monto_cargo)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#fbbf24', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {c.concepto_cargo}
                                    </p>
                                </div>
                                <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: '#666', textTransform: 'uppercase' }}>
                                        Registrado por: {c.nombre_registrador || 'Admin'}
                                    </span>
                                    {onDelete && (
                                        <button
                                            onClick={() => onDelete(c._id)}
                                            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '5px' }}
                                            title="Eliminar Cargo"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL GALERÍA */}
            {galleryState.isOpen && (
                <div className="modal-overlay" onClick={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}>
                    <div className="gallery-content" onClick={e => e.stopPropagation()}>
                        <img
                            src={galleryState.images[galleryState.currentIndex]}
                            alt={`Comprobante ${galleryState.currentIndex + 1}`}
                            className="modal-img"
                        />

                        {galleryState.images.length > 1 && (
                            <div className="gallery-nav">
                                <button className="nav-btn" onClick={prevImage}>❮</button>
                                <span className="nav-counter">{galleryState.currentIndex + 1} / {galleryState.images.length}</span>
                                <button className="nav-btn" onClick={nextImage}>❯</button>
                            </div>
                        )}

                        <button className="close-btn" onClick={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}>
                            CERRAR
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
