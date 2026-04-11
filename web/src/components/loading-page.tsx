import { Card } from './card'
import { Main } from './main'
import { Link } from './link'
import { LoadingIcon } from './loading-icon'

export function LoadingPage() {
  return (
    <Main>
      <Card className="text-center text-gray-600">
        <LoadingIcon align="center" className="w-12 h-12 inline" />
        <div className="py-4 font-bold text-3xl">Loading...</div>
        <div className="py-4">
          <Link onClick={() => window.location.reload()}>reload</Link>
        </div>
      </Card>
    </Main>
  )
}
