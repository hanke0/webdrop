import { RefObject } from 'react'
import { useCallback, useEffect, useState } from 'react'

type Params = {
  labelRef: RefObject<HTMLLabelElement>
  onChange: (file: File) => void
}

export default function useDragging({ labelRef, onChange }: Params): boolean {
  const [dragging, setDragging] = useState(false)

  const handleDragHover = useCallback((ev: DragEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    if (ev.dataTransfer?.items && ev.dataTransfer.items.length !== 0) {
      setDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((ev: DragEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    setDragging(false)
  }, [])

  const handleDrop = useCallback(
    (ev: DragEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      setDragging(false)
      const eventFiles = ev.dataTransfer?.files
      if (eventFiles && eventFiles.length > 0) {
        const file = eventFiles[0]
        onChange(file)
      }
    },
    [onChange]
  )

  useEffect(() => {
    const ele = labelRef.current
    if (!ele) {
      return
    }
    ele.addEventListener('dragover', handleDragHover)
    ele.addEventListener('dragleave', handleDragLeave)
    ele.addEventListener('drop', handleDrop)

    return () => {
      ele.removeEventListener('dragover', handleDragHover)
      ele.removeEventListener('dragleave', handleDragLeave)
      ele.removeEventListener('drop', handleDrop)
    }
  }, [handleDragHover, handleDragLeave, handleDrop, labelRef])

  return dragging
}
