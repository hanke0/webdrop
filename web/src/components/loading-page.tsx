import { Card } from './card'
import { Main } from './main'
import { Link } from './link'
import { LoadingIcon } from './loading-icon'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from './language-switch'

export function LoadingPage() {
  const { t } = useTranslation()
  return (
    <Main>
      <Card className="text-center">
        <LoadingIcon align="center" className="w-12 h-12 inline" />
        <div className="py-5 text-lg font-semibold text-[var(--wd-text)]">
          {t('loadingPage.title')}
        </div>
        <p className="text-sm text-[var(--wd-muted)] mb-4">
          {t('loadingPage.subtitle')}
        </p>
        <div>
          <Link onClick={() => window.location.reload()}>
            {t('loadingPage.reload')}
          </Link>
        </div>
        <LanguageSwitch className="mt-8 opacity-80" />
      </Card>
    </Main>
  )
}
