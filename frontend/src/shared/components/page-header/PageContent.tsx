import clsx from 'clsx'

interface PageContentProps {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
}

export function PageContent({ children, className, noPadding }: PageContentProps) {
  return (
    <div className={clsx(!noPadding && 'px-6 py-6', className)}>
      {children}
    </div>
  )
}
