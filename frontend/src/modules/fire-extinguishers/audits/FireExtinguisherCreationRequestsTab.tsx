import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { fireExtinguisherAuditQueries } from '../../../shared/api/fire-extinguisher-audits.api'
import { formatDate } from '../../../shared/utils/format'
import { ROUTES } from '../../../app/routes'
import { CREATION_REQUEST_STATUS_LABELS } from '../../../shared/utils/fireExtinguisherCreationRequests'


export function FireExtinguisherCreationRequestsTab() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery(fireExtinguisherAuditQueries.creationRequests())

  return (
    <SectionCard noPadding>
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Solicitudes de alta</h2>
        <p className="text-xs text-slate-500 mt-1">Las solicitudes pendientes o rechazadas no forman parte del inventario.</p>
      </div>
      {isLoading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">Cargando solicitudes…</div>
      ) : data.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <ClipboardList className="mx-auto text-slate-300 mb-3" size={28} />
          <p className="text-sm font-medium text-slate-700">Sin solicitudes de alta</p>
          <p className="text-xs text-slate-500 mt-1">Todavía no hay solicitudes para mostrar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Cilindro</th>
                <th className="text-left px-5 py-3 font-medium">Establecimiento</th>
                <th className="text-left px-5 py-3 font-medium">Tipo / capacidad</th>
                <th className="text-left px-5 py-3 font-medium">Solicitante</th>
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((request) => (
                <tr
                  key={request.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_CREATION_REQUEST_DETAIL(request.id))}
                >
                  <td className="px-5 py-3 font-medium text-slate-900">{request.cylinderNumber}</td>
                  <td className="px-5 py-3 text-slate-700">{request.establishment}</td>
                  <td className="px-5 py-3 text-slate-700">{request.type} · {request.capacity}</td>
                  <td className="px-5 py-3 text-slate-600">{request.requestedBy}</td>
                  <td className="px-5 py-3 text-slate-600">{formatDate(request.requestedAt)}</td>
                  <td className="px-5 py-3"><StatusPill status={request.status} label={CREATION_REQUEST_STATUS_LABELS[request.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
