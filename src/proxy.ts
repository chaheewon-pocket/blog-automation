import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const isLocal =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('[::1]')

  if (isLocal) {
    return NextResponse.next()
  }

  const expectedUser = process.env.BASIC_AUTH_USER
  const expectedPass = process.env.BASIC_AUTH_PASSWORD

  if (!expectedUser || !expectedPass) {
    return new Response(
      'External access requires BASIC_AUTH_USER and BASIC_AUTH_PASSWORD env vars.',
      { status: 503 },
    )
  }

  const auth = request.headers.get('authorization')
  const expected =
    'Basic ' + Buffer.from(`${expectedUser}:${expectedPass}`).toString('base64')

  if (auth !== expected) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="PocketBlog Insight"',
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)',
  ],
}
