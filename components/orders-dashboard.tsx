'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Bell, Check, ChefHat, Clock3, Eye, LoaderCircle, RefreshCw, Search, ShieldAlert, X } from 'lucide-react'

type Order = {
  id: string | number
  producto: string
  estado: string
  cantidad: number
  cliente: string | null
}

type OrderGroup = {
  key: string
  cliente: string
  items: Order[]
  totalQuantity: number
}

const SUPABASE_URL = 'https://eeapyvpcsyngnqzlqgvb.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_FLFlDnyJKB5SERnjsDk53g_KlmZIgQT'
const POLL_INTERVAL = 10000

async function fetchPendingOrders() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos?select=id,producto,estado,cantidad,cliente&estado=eq.Pendiente&order=id.desc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `No se pudieron cargar los pedidos (${response.status}).`)
  }
  return (await response.json()) as Order[]
}

async function setOrderStatus(items: Order[], status: 'Aceptado' | 'Rechazado') {
  const ids = items.map((item) => encodeURIComponent(String(item.id))).join(',')
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos?id=in.(${ids})&estado=eq.Pendiente`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ estado: status }),
    },
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `No se pudo actualizar el pedido (${response.status}).`)
  }
  const updated = (await response.json()) as Order[]
  if (updated.length !== items.length) {
    throw new Error('No se pudieron actualizar todos los productos de este pedido. Puede que algunos ya no estén pendientes o falten permisos.')
  }
}

function formatOrderId(id: Order['id']) {
  return `#${String(id).slice(-6).padStart(4, '0')}`
}

export function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refreshOrders = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const data = await fetchPendingOrders()
      setOrders(data)
      setError('')
      setLastUpdated(new Date())
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Ocurrió un error al consultar Supabase.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshOrders()
    const timer = window.setInterval(() => void refreshOrders(), POLL_INTERVAL)
    return () => window.clearInterval(timer)
  }, [refreshOrders])

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, OrderGroup>()

    for (const order of orders) {
      const rawCustomerName = order.cliente?.trim().replace(/\s+/g, ' ')
      const customerName = rawCustomerName || 'Cliente sin nombre'
      const normalizedCustomerName = customerName.toLocaleLowerCase('es')
      const displayCustomerName = normalizedCustomerName.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('es'))
      const key = rawCustomerName
        ? `cliente:${normalizedCustomerName}`
        : `pedido:${String(order.id)}`
      const group = groups.get(key)

      if (group) {
        group.items.push(order)
        continue
      }

      groups.set(key, { key, cliente: displayCustomerName, items: [order], totalQuantity: 0 })
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      totalQuantity: group.items.reduce((total, item) => total + Number(item.cantidad || 0), 0),
    }))
  }, [orders])

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    if (!normalized) return groupedOrders
    return groupedOrders.filter((group) =>
      [group.cliente, ...group.items.flatMap((item) => [item.producto, String(item.id)])].some((value) =>
        String(value).toLocaleLowerCase('es').includes(normalized),
      ),
    )
  }, [groupedOrders, query])

  const handleDecision = async (group: OrderGroup, status: 'Aceptado' | 'Rechazado') => {
    setBusyKey(group.key)
    setError('')
    try {
      await setOrderStatus(group.items, status)
      const decidedIds = new Set(group.items.map((item) => String(item.id)))
      setOrders((current) => current.filter((item) => !decidedIds.has(String(item.id))))
      setExpandedGroupKey(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el pedido.')
      void refreshOrders()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <main className="orders-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Terreno Broaster, inicio">
          <span className="brand-mark"><ChefHat size={22} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>terreno</strong><small>BROASTER</small></span>
        </a>
        <div className="topbar-right">
          <span className="live-indicator"><span /> En vivo</span>
          <span className="topbar-divider" />
          <span className="staff-label">Panel de cocina</span>
          <span className="avatar" aria-label="Personal de cocina">TB</span>
        </div>
      </header>

      <section className="dashboard" id="inicio">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><Activity size={14} /> CENTRO DE OPERACIONES</div>
            <h1>Pedidos <span>Online</span></h1>
            <p>Ten a la vista lo que está llegando. Tú te encargas del sabor.</p>
          </div>
          <div className="date-chip"><Clock3 size={15} /><span>{new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></div>
        </div>

        <div className="summary-row">
          <div className="summary-card">
            <span className="summary-icon"><Bell size={18} /></span>
            <div><span className="summary-label">Por atender</span><strong>{groupedOrders.length}</strong></div>
            <span className="summary-caption">{groupedOrders.length === 1 ? 'pedido pendiente' : 'pedidos pendientes'}</span>
          </div>
          <div className="sync-status">
            <span className="sync-dot" />
            <div><strong>Sincronización activa</strong><span>Actualiza automáticamente cada 10 segundos</span></div>
            <button className="icon-button" type="button" onClick={() => void refreshOrders(true)} disabled={refreshing} aria-label="Actualizar pedidos">
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <section className="orders-panel" aria-labelledby="orders-title">
          <div className="panel-heading">
            <div className="panel-title-group">
              <h2 id="orders-title">Cola de pedidos</h2>
              <span className="count-badge">{groupedOrders.length}</span>
            </div>
            <label className="search-box">
              <Search size={16} />
              <span className="sr-only">Buscar pedidos</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o producto" />
              {query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}><X size={14} /></button>}
            </label>
          </div>

          {error && <div className="error-banner" role="alert"><ShieldAlert size={18} /><div><strong>No se pudo sincronizar</strong><span>{error}</span><small>Verifica la URL, la clave pública y las políticas de acceso de la tabla en Supabase.</small></div><button type="button" onClick={() => void refreshOrders(true)} aria-label="Reintentar"><RefreshCw size={15} /></button></div>}

          {loading ? (
            <div className="empty-state"><LoaderCircle className="spin" size={28} /><strong>Conectando con la cocina…</strong><span>Estamos consultando los pedidos pendientes.</span></div>
          ) : filteredGroups.length === 0 ? (
            <div className="empty-state">
              <span className="empty-illustration"><ChefHat size={27} /></span>
              <strong>{query ? 'No encontramos coincidencias' : error ? 'Esperando conexión' : 'Todo al día por aquí'}</strong>
              <span>{query ? 'Prueba con otro nombre o producto.' : error ? 'Cuando se restablezca la conexión, volveremos a consultar.' : 'Los nuevos pedidos pendientes aparecerán automáticamente.'}</span>
            </div>
          ) : (
            <div className="order-list">
              {filteredGroups.map((group) => {
                const expanded = expandedGroupKey === group.key
                const detailsId = `pedido-detalles-${String(group.items[0].id)}`

                return (
                  <article className="order-card order-group-card" key={group.key}>
                    <div className="group-summary-line">
                      <div className="order-main">
                        <div className="order-id-line"><span className="pending-dot" /><span className="pending-label">{group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}</span></div>
                        <h3>{group.cliente}</h3>
                        <div className="order-meta"><span>{group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}</span><span className="meta-separator" /><span>{group.totalQuantity} {group.totalQuantity === 1 ? 'unidad en total' : 'unidades en total'}</span></div>
                      </div>
                      <div className="group-controls">
                        <button className="details-button" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedGroupKey(expanded ? null : group.key)}>
                          <Eye size={16} /> {expanded ? 'Ocultar detalles' : 'Ver detalles'}
                        </button>
                        <div className="order-actions">
                          <button className="reject-button" type="button" onClick={() => void handleDecision(group, 'Rechazado')} disabled={busyKey !== null}>
                            {busyKey === group.key ? <LoaderCircle className="spin" size={16} /> : <X size={16} />} Rechazar
                          </button>
                          <button className="accept-button" type="button" onClick={() => void handleDecision(group, 'Aceptado')} disabled={busyKey !== null}>
                            {busyKey === group.key ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Aceptar pedido
                          </button>
                        </div>
                      </div>
                    </div>
                    <section className="group-details" id={detailsId} aria-label={`Detalles del pedido de ${group.cliente}`} hidden={!expanded}>
                      <div className="details-heading"><strong>Pedido de {group.cliente}</strong><span>{group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}</span></div>
                      <ul className="details-list">
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <span className="detail-product"><strong>{item.producto}</strong><small>{formatOrderId(item.id)}</small></span>
                            <span className="detail-quantity">{item.cantidad} {item.cantidad === 1 ? 'unidad' : 'unidades'}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </article>
                )
              })}
            </div>
          )}

          <div className="panel-footer"><span><span className="footer-dot" /> Mostrando solo pedidos pendientes</span><span>{lastUpdated ? `Última actualización: ${new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastUpdated)}` : 'Preparando conexión…'}</span></div>
        </section>
        <footer className="page-footer">Terreno Broaster <span>·</span> Hecho para atender mejor.</footer>
      </section>
    </main>
  )
}
