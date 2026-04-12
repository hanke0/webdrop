import { useTranslation } from 'react-i18next'

type LanguageSwitchProps = {
  className?: string
}

export function LanguageSwitch(props: LanguageSwitchProps) {
  const { i18n, t } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  return (
    <nav
      className={`flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[10px] leading-tight ${props.className ?? ''}`}
      aria-label={t('language.switch')}
    >
      <button
        type="button"
        aria-current={!isZh ? 'true' : undefined}
        className={`rounded px-0.5 py-0.5 transition-colors duration-200 ${
          !isZh
            ? 'text-[var(--wd-muted)] font-medium'
            : 'text-[var(--wd-faint)] hover:text-[var(--wd-muted)]'
        }`}
        onClick={() => void i18n.changeLanguage('en')}
      >
        {t('language.en')}
      </button>
      <span className="text-[var(--wd-border-strong)] select-none" aria-hidden>
        ·
      </span>
      <button
        type="button"
        aria-current={isZh ? 'true' : undefined}
        className={`rounded px-0.5 py-0.5 transition-colors duration-200 ${
          isZh
            ? 'text-[var(--wd-muted)] font-medium'
            : 'text-[var(--wd-faint)] hover:text-[var(--wd-muted)]'
        }`}
        onClick={() => void i18n.changeLanguage('zh-CN')}
      >
        {t('language.zh')}
      </button>
    </nav>
  )
}
