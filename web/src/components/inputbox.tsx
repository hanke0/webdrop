export type InputBoxProps = {
  buttonText: string
  placeholder: string
  onSubmit: (value: string) => void
  type?: string
  autoComplete?: string
}

export function InputBox(props: InputBoxProps) {
  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault()
        const value = e.currentTarget.input.value
        props.onSubmit(value)
        e.currentTarget.input.value = ''
      }}
    >
      <div className="relative">
        <input
          type={props.type ? props.type : 'text'}
          className="block w-full py-3 ps-4 pe-[5.5rem] text-sm text-[var(--wd-text)] placeholder:text-[var(--wd-faint)] bg-[var(--wd-input-bg)] border border-[var(--wd-border)] rounded-xl focus:outline-none focus:border-[color-mix(in_oklab,var(--wd-accent)_55%,var(--wd-border))] focus:ring-2 focus:ring-[var(--wd-accent-glow)] transition-[border-color,box-shadow] duration-200"
          placeholder={props.placeholder}
          name="input"
          required
          autoComplete={props.autoComplete}
        />
        <button
          type="submit"
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--wd-accent)] text-[var(--wd-on-accent)] font-semibold text-xs px-3 py-2 hover:bg-[var(--wd-accent-bright)] active:scale-95 transition-[transform,background-color] duration-200"
        >
          {props.buttonText}
        </button>
      </div>
    </form>
  )
}
