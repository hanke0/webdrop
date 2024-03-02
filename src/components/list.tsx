import React from 'react'

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
      className={`basis-auto ${props.itemClassName}`}
      onClick={onClick}
    >
      {props.genContent(item)}
    </li>
  )
}

type ListProps<T> = {
  items: T[]
  getKey: (item: T) => string
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

  return (
    <ul role="list" className={`block ${props.className}`}>
      {props.items.map((ele) => (
        <ListItem
          key={props.getKey(ele)}
          item={ele}
          selectCallback={handleClick}
          genContent={props.genContent}
          itemClassName={props.itemClassName}
        />
      ))}
    </ul>
  )
}
