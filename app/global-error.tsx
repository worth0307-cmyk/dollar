'use client'

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html>
      <body style={{ background: '#111', color: '#fff', fontFamily: 'sans-serif', padding: '2rem' }}>
        <p>Something went wrong.</p>
        <button onClick={unstable_retry} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Try again
        </button>
      </body>
    </html>
  )
}
