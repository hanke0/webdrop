import {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

export type CodeBoxProps = {
  length: number
  type?: string
  defaultCode?: string
  validator?: (input: string, index: number) => boolean
  beforeChange?: (code: string) => string
  onChange?: (code: string) => void
  onFull?: (code: string) => void
}

const cellClass =
  'inline-block w-10 h-11 m-1 border border-[var(--wd-border-strong)] rounded-lg text-center text-lg font-semibold text-[var(--wd-text)] bg-[var(--wd-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--wd-accent-glow)] focus:border-[var(--wd-accent)] transition-[border-color,box-shadow] duration-200'

export function CodeBox(props: CodeBoxProps) {
  const [code, setCode] = useState(new Array(props.length).fill(''))
  const doms = useRef(new Array(props.length).fill(null))
  const id = useId()

  useEffect(() => {
    if (props.defaultCode) {
      const newCode = props.defaultCode.split('')
      setCode(newCode.slice(0, props.length))
    }
  }, [props.defaultCode, props.length])

  const onChange = (e: ChangeEvent<HTMLInputElement>, i: number) => {
    let value = e.target.value.trim()

    if (props.beforeChange) {
      value = props.beforeChange(value)
    }

    if (props.validator) {
      if (value !== '' && !props.validator(value, i)) {
        e.target.select()
        return
      }
    }
    const newCode = [...code]
    newCode[i] = value
    setCode(newCode)
    if (value !== '') {
      focusOn(i, 1)
    }
    props.onChange?.(newCode.join(''))
  }

  const setCodeAt = (i: number, value: string) => {
    setCode((prev) => {
      const next = [...prev]
      next[i] = value
      return next
    })
  }

  const focusOn = (cur: number, step: number) => {
    const i = cur + step
    if (i < 0) {
      if (cur === 0) {
        doms.current[props.length - 1].focus()
        return
      }
      doms.current[0].focus()
      return
    }
    if (i > props.length - 1) {
      if (cur === props.length - 1) {
        doms.current[0].focus()
        return
      }
      doms.current[props.length - 1].focus()
      return
    }
    doms.current[i].focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    switch (e.code) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        setCodeAt(i, '')
        focusOn(i, -1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        focusOn(i, -1)
        break
      case 'ArrowRight':
      case 'ArrowDown':
      case 'Tab':
        e.preventDefault()
        focusOn(i, 1)
        break
      case 'Enter':
        e.preventDefault()
        if (props.onFull) {
          const full = code.join('')
          if (full.length !== props.length) {
            return
          }
          props.onFull(code.join(''))
        }
        break
      default:
        e.currentTarget.select()
        break
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, cur: number) => {
    e.preventDefault()
    const pastedValue = e.clipboardData.getData('Text')
    const newCode = [...code]
    let filled = 0
    for (let i = cur; i < props.length; i++) {
      let ch = pastedValue.charAt(filled)
      if (!ch) break
      if (props.beforeChange) ch = props.beforeChange(ch)
      if (props.validator && !props.validator(ch, i)) break
      newCode[i] = ch
      filled++
    }
    if (filled === 0) return
    setCode(newCode)
    focusOn(cur + filled - 1, 0)
    const full = newCode.join('')
    props.onChange?.(full)
    if (props.onFull && newCode.every((v) => v !== '')) {
      props.onFull(full)
    }
  }

  const onCopy = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    navigator.clipboard?.writeText(code.join(''))
  }

  const codeBox = []
  const inputType = props.type || 'input'
  for (let i = 0; i < props.length; i++) {
    codeBox.push(
      <input
        key={`${id}-${i}`}
        autoFocus={i == 0}
        className={cellClass}
        type={inputType}
        maxLength={1}
        autoComplete={i === 0 ? 'one-time-code' : 'off'}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        value={code[i]}
        ref={(d) => {
          doms.current[i] = d
        }}
        onChange={(e) => onChange(e, i)}
        onKeyDown={(e) => onKeyDown(e, i)}
        onFocus={(e) => e.target.select()}
        onPaste={(e) => onPaste(e, i)}
        onCopy={onCopy}
      />
    )
  }

  return (
    <div className="block text-center">
      <form>{codeBox}</form>
    </div>
  )
}
