import React, { useId } from 'react'

type ListItemProps<T> = {
  item: T
  selectCallback: (item: T) => void
  genContent: (item: T) => React.ReactNode
  itemClassName?: string
}

function ListItem<T>(props: ListItemProps<T>) {
  const item = props.item
  const onClick = () => {
    props.selectCallback(item)
  }
  return (
    <li
      className={`${props.itemClassName} shadow my-2 py-2 px-2 sm:py-2 hover:bg-slate-100`}
      onClick={onClick}
    >
      {props.genContent(item)}
    </li>
  )
}

type ListProps<T> = {
  items: T[]
  selectCallback?: (item: T) => void
  genContent: (item: T) => React.ReactNode
  className?: string
  itemClassName?: string
}

export function List<T>(props: ListProps<T>) {
  const handleClick = (ele: T) => {
    if (props.selectCallback) {
      props.selectCallback(ele)
    }
  }
  const id = useId()
  return (
    <ul role="list" className={props.className}>
      {props.items.map((ele, i) => (
        <ListItem
          key={`${id}-${i}`}
          item={ele}
          selectCallback={handleClick}
          genContent={props.genContent}
          itemClassName={props.itemClassName}
        />
      ))}
    </ul>
  )
}
