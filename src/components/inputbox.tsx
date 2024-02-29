export type UploadProps = {
  buttonText: string
  placeholder: string
  onSubmit: (e: string) => void
  type?: string
  autoComplete?: string
}

export function InputBox(props: UploadProps) {
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
          className="block w-full p-2 ps-4 text-sm text-gray-900 border border-gray-300 rounded-lg"
          placeholder={props.placeholder}
          name="input"
          required
          autoComplete={props.autoComplete}
        />
        <button
          type="submit"
          className="text-white absolute end-2.5 bottom-1 text-gray-700 bg-gray-100 font-medium rounded-lg text-sm px-2 py-1"
        >
          {props.buttonText}
        </button>
      </div>
    </form>
  )
}
