import { Card } from './card'
import { Main } from './main'
import { Link } from './link'

export function ErrorPage(props: { err: string }) {
  return (
    <Main>
      <Card className="text-center text-gray-600">
        <h1 className="text-red-400 text-4xl my-4">Bad Things Happen</h1>
        <div className="py-2 text-gray-400">{props.err}</div>
        <div className="py-2">
          <Link onClick={() => window.location.reload()}>reload</Link>
        </div>
      </Card>
    </Main>
  )
}
