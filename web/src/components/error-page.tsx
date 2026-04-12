import { Card } from './card'
import { Main } from './main'
import { Link } from './link'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from './language-switch'

export function ErrorPage(props: { err: string }) {
  const { t } = useTranslation()
  return (
    <Main>
      <Card className="text-center">
        <h1 className="text-xl font-semibold text-[var(--wd-danger)] my-2">
          {t('errorPage.title')}
        </h1>
        <div className="py-2 text-sm text-[var(--wd-muted)] leading-relaxed px-2">
          {props.err}
        </div>
        <div className="py-3">
          <Link onClick={() => window.location.reload()}>
            {t('errorPage.reload')}
          </Link>
        </div>
        <LanguageSwitch className="mt-8 opacity-80" />
      </Card>
    </Main>
  )
}
