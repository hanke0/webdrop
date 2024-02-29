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
    setCodeAt(i, value)
    if (value !== '') {
      focusOn(i, 1)
    }
    const full = code.join('')
    if (props.onChange) {
      props.onChange(full)
    }
  }

  const setCodeAt = (i: number, value: string) => {
    const newCode = code.map((v) => v)
    newCode[i] = value
    console.log('newCode', newCode)
    setCode(newCode)
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
          if (full.length != props.length) {
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
    let currentInput = 0
    for (let i = cur; i < props.length; i++) {
      focusOn(i, 0)
      let pastedCharacter = pastedValue.charAt(currentInput)
      if (!pastedCharacter) {
        return
      }
      if (props.beforeChange) {
        pastedCharacter = props.beforeChange(pastedCharacter)
      }
      if (props.validator && !props.validator(pastedCharacter, i)) {
        return
      }
      doms.current[i].value = pastedCharacter
      currentInput++
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
        className="inline-block w-10 h-10 m-1 border-2 border-gray-300 rounded-md text-center focus:outline-none focus:border-blue-500"
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
