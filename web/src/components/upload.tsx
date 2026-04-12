import useDragging from '../hooks/useDragging'
import { useId, useRef } from 'react'

type UploadProps = {
  callback: (file: File) => void
  name?: string
  className?: string
  children?: React.ReactNode
}

export function Upload(props: UploadProps) {
  const id = useId()
  const labelRef = useRef<HTMLLabelElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      props.callback(files[0])
    }
  }

  const content = props.children || (
    <>
      <span className="font-semibold text-[var(--wd-text)]">点击选择</span>
      <span className="text-[var(--wd-muted)]"> 或拖入文件</span>
    </>
  )

  const dragging = useDragging({ labelRef, onChange: props.callback })

  return (
    <div
      className={`flex items-center justify-center w-full ${props.className ?? ''}`}
    >
      <label
        htmlFor={id}
        className={`flex flex-col items-center justify-center w-full min-h-[11rem] border-2 border-dashed rounded-xl cursor-pointer transition-[background-color,border-color,transform] duration-200 ${
          dragging
            ? 'border-[var(--wd-accent)] bg-[color-mix(in_oklab,var(--wd-accent)_10%,white)] scale-[1.01]'
            : 'border-[var(--wd-border-strong)] bg-[var(--wd-input-bg)] hover:border-[color-mix(in_oklab,var(--wd-accent)_40%,var(--wd-border))] hover:bg-[var(--wd-surface-muted)]'
        }`}
        ref={labelRef}
      >
        <div className="flex flex-col items-center justify-center pt-6 pb-6 px-4 text-center">
          <svg
            className="w-9 h-9 mb-3 text-[var(--wd-accent)] opacity-90"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 20 16"
          >
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
            />
          </svg>
          <p className="text-sm text-[var(--wd-muted)]">
            {dragging ? (
              <span className="font-semibold text-[var(--wd-accent)]">
                松开以上传
              </span>
            ) : (
              content
            )}
          </p>
        </div>
        <input
          ref={inputRef}
          onChange={onFileChange}
          id={id}
          type="file"
          className="hidden"
        />
      </label>
    </div>
  )
}
