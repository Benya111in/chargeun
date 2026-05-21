export function isLocalSeasonalEnabled() {
  return (
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_SEASONAL === '1'
  )
}
