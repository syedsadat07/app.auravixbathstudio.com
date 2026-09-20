import { getSessionUser, jsonError } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return Response.json({ error: 'Not authenticated. Please sign in.' }, { status: 401 })
    }
    return Response.json({ user })
  } catch (e) {
    return jsonError(e)
  }
}
