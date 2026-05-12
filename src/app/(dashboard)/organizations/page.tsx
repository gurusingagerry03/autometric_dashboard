'use client'

import { useState, useMemo } from 'react'
import OrgList from '@/components/organizations/OrgList'
import EmptyState from '@/components/organizations/EmptyState'
import CreateOrgModal from '@/components/organizations/CreateOrgModal'
import OrgAvatar from '@/components/organizations/OrgAvatar'
import { Organization } from '@/lib/organizations/types'
import { Invitation } from '@/lib/invitations/types'

const DUMMY_ORGS: Organization[] = [
  {
    id: '1', name: 'Autometric HQ', created_at: '2025-01-14T00:00:00Z', role: 'OWNER',
    member_count: 8, brand_count: 4,
    members_preview: [{ name: 'Gerry Sinaga' }, { name: 'Alex Kim' }, { name: 'Sarah Chen' }],
  },
  {
    id: '2', name: 'Brand Studio', created_at: '2025-03-02T00:00:00Z', role: 'ADMIN',
    member_count: 4, brand_count: 2,
    members_preview: [{ name: 'Diana Park' }, { name: 'Tom Lee' }],
  },
  {
    id: '3', name: 'Research Team', created_at: '2025-04-21T00:00:00Z', role: 'VIEWER',
    member_count: 12, brand_count: 7,
    members_preview: [{ name: 'Mira Jones' }, { name: 'Kevin Wu' }, { name: 'Lisa Ray' }],
  },
]

const DUMMY_INVITES: Invitation[] = [
  { id: '1', org_id: '4', org_name: 'Design Co', invited_by: 'Alex Kim', invited_at: '2026-05-10T00:00:00Z', member_count: 5 },
  { id: '2', org_id: '5', org_name: 'Growth Labs', invited_by: 'Sarah Chen', invited_at: '2026-05-12T00:00:00Z', member_count: 12 },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>(DUMMY_ORGS)
  const [invites, setInvites] = useState<Invitation[]>(DUMMY_INVITES)
  const [showCreate, setShowCreate] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'ALL' | Organization['role']>('ALL')

  const totalMembers = orgs.reduce((sum, o) => sum + o.member_count, 0)
  const totalBrands = orgs.reduce((sum, o) => sum + o.brand_count, 0)
  const hasInvites = invites.length > 0

  const filteredOrgs = useMemo(() =>
    activeFilter === 'ALL' ? orgs : orgs.filter(o => o.role === activeFilter),
    [orgs, activeFilter]
  )

  const tabs: { key: 'ALL' | Organization['role']; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'OWNER', label: 'Owner' },
    { key: 'ADMIN', label: 'Admin' },
    { key: 'VIEWER', label: 'Viewer' },
  ]

  function handleCreated(org: Organization) {
    setOrgs(prev => [org, ...prev])
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="px-8 pt-8 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[#111827] tracking-tight">Organizations</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[13px] text-[#9ca3af]">{orgs.length} organizations</span>
              <span className="text-[#d1d5db]">·</span>
              <span className="text-[13px] text-[#9ca3af]">{totalMembers} members</span>
              <span className="text-[#d1d5db]">·</span>
              <span className="text-[13px] text-[#9ca3af]">{totalBrands} brands</span>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-9 px-4 bg-[#3d7e96] hover:bg-[#2d6e85] text-white text-[13px] font-medium rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            New Organization
          </button>
        </div>
      </div>

      <div className="mx-8 border-b border-[#e5e7eb]" />

      {/* Invitations — only if pending */}
      {hasInvites && (
        <div className="px-8 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
              Invitations
            </span>
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3d7e96] text-white text-[10px] font-semibold flex items-center justify-center">
              {invites.length}
            </span>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-lg divide-y divide-[#f3f4f6]">
            {invites.map(invite => (
              <div key={invite.id} className="flex items-center gap-4 h-[60px] px-5">
                <OrgAvatar name={invite.org_name} size={28} />

                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-[#111827] truncate">{invite.org_name}</p>
                  <p className="text-[12px] text-[#9ca3af]">
                    Invited by <span className="text-[#6b7280]">{invite.invited_by}</span>
                    {' · '}{formatDate(invite.invited_at)}
                  </p>
                </div>

                <div className="flex items-center gap-1 text-[#9ca3af] mr-2">
                  <span className="material-symbols-outlined text-[13px]">group</span>
                  <span className="text-[12px]">{invite.member_count}</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setInvites(prev => prev.filter(i => i.id !== invite.id))}
                    className="h-7 px-3 text-[12px] font-medium text-[#6b7280] hover:text-[#111827] border border-[#e5e7eb] hover:border-[#d1d5db] rounded-md transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => setInvites(prev => prev.filter(i => i.id !== invite.id))}
                    className="h-7 px-3 text-[12px] font-medium bg-[#3d7e96] hover:bg-[#2d6e85] text-white rounded-md transition-colors"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="px-8 pt-4 flex items-center gap-1">
        {tabs.map(tab => {
          const count = tab.key === 'ALL' ? orgs.length : orgs.filter(o => o.role === tab.key).length
          if (tab.key !== 'ALL' && count === 0) return null
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[12.5px] font-medium transition-colors ${
                activeFilter === tab.key
                  ? 'bg-[#edf5f8] text-[#1e6278]'
                  : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]'
              }`}
            >
              {tab.label}
              <span className={`text-[11px] ${activeFilter === tab.key ? 'text-[#3d7e96]' : 'text-[#9ca3af]'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Organizations grid */}
      <div className="px-8 pt-4 pb-8">
        {filteredOrgs.length === 0 ? (
          <EmptyState onNew={() => setShowCreate(true)} />
        ) : (
          <OrgList orgs={filteredOrgs} />
        )}
      </div>

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
