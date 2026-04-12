import { Card } from './card'
import { Main } from './main'
import { Link } from './link'

export function ErrorPage(props: { err: string }) {
  return (
    <Main>
      <Card className="text-center">
        <h1 className="text-xl font-semibold text-[var(--wd-danger)] my-2">
          出错了
        </h1>
        <div className="py-2 text-sm text-[var(--wd-muted)] leading-relaxed px-2">
          {props.err}
        </div>
        <div className="py-3">
          <Link onClick={() => window.location.reload()}>重新加载</Link>
        </div>
      </Card>
    </Main>
  )
}
