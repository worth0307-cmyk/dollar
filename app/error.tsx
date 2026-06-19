'use client'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-white">
      <p className="text-red-400">Something went wrong: {error.message}</p>
      <button
        onClick={unstable_retry}
        className="rounded bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
      >
        Try again
      </button>
    </div>
  )
}
