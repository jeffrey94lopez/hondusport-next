import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Detectar sesión activa de Supabase por cookie
  const hasSession = request.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  )

  if (!hasSession && !pathname.startsWith('/admin/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  if (hasSession && pathname === '/admin/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
