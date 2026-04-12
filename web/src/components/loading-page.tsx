import { Card } from './card'
import { Main } from './main'
import { Link } from './link'
import { LoadingIcon } from './loading-icon'

export function LoadingPage() {
  return (
    <Main>
      <Card className="text-center">
        <LoadingIcon align="center" className="w-12 h-12 inline" />
        <div className="py-5 text-lg font-semibold text-[var(--wd-text)]">
          正在连接…
        </div>
        <p className="text-sm text-[var(--wd-muted)] mb-4">
          建立房间与点对点通道
        </p>
        <div>
          <Link onClick={() => window.location.reload()}>重新加载</Link>
        </div>
      </Card>
    </Main>
  )
}
