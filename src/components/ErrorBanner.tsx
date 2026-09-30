type ErrorBannerProps = {
  content: string
}

/** The presentation of an error entry: the failed turn, without losing the conversation. */
export function ErrorBanner({ content }: ErrorBannerProps) {
  return (
    <div className="message message--error" role="alert">
      {content}
    </div>
  )
}
