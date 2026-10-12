import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jectnwtdeitkuilfvdmj.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplY3Rud3RkZWl0a3VpbGZ2ZG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTYzNzEsImV4cCI6MjEwNzM5MjM3MX0.Rby9ALli0JzuY_CJVtuMrwBU-gptIrxm534TxERmn5M'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
