'use client'

import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import { Loader2 } from 'lucide-react'
import AppShell from '@/components/shell/app-shell'
import LoginView from '@/components/views/login-view'
import DashboardView from '@/components/views/dashboard-view'
import LeadsView from '@/components/views/leads-view'
import LeadDetailView from '@/components/views/lead-detail-view'
import CustomersView from '@/components/views/customers-view'
import CustomerDetailView from '@/components/views/customer-detail-view'
import QuotationsView from '@/components/views/quotations-view'
import QuotationWizardView from '@/components/views/quotation-wizard-view'
import QuotationDetailView from '@/components/views/quotation-detail-view'
import OrdersView from '@/components/views/orders-view'
import AppointmentsView from '@/components/views/appointments-view'
import MaterialsView from '@/components/views/materials-view'
import PackagesView from '@/components/views/packages-view'
import ReportsView from '@/components/views/reports-view'
import AdminManagementView from '@/components/views/admin-management-view'
import SettingsView from '@/components/views/settings-view'
import AuditLogsView from '@/components/views/audit-logs-view'

function ViewRenderer() {
  const { view, params } = useNav()

  switch (view) {
    case 'dashboard':
      return <DashboardView />
    case 'leads':
      return <LeadsView />
    case 'lead-detail':
      return <LeadDetailView />
    case 'customers':
      return <CustomersView />
    case 'customer-detail':
      return <CustomerDetailView />
    case 'quotations':
      return <QuotationsView />
    case 'quotation-wizard':
      return <QuotationWizardView />
    case 'quotation-detail':
      return <QuotationDetailView />
    case 'orders':
      return <OrdersView />
    case 'appointments':
      return <AppointmentsView />
    case 'materials':
      return <MaterialsView />
    case 'packages':
      return <PackagesView />
    case 'reports':
      return <ReportsView />
    case 'admins':
      return <AdminManagementView />
    case 'settings':
      return <SettingsView />
    case 'audit-logs':
      return <AuditLogsView />
    default:
      return (
        <div className="p-8 text-center text-muted-foreground">
          Page not found.{' '}
          <a href="#/dashboard" className="text-primary underline">
            Go to Dashboard
          </a>
          {params && Object.keys(params).length > 0 ? '' : null}
        </div>
      )
  }
}

export default function Home() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <img src="/brand/logo.png" alt="AURAVIX BATH STUDIO" className="h-16 w-16 rounded-2xl object-cover" />
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AURAVIX BATH STUDIO…
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginView />
  }

  return (
    <AppShell>
      <ViewRenderer />
    </AppShell>
  )
}
