import React from "react"


export type Item<T> = {
    id: number;
    value: T;
    selected: boolean;
}

export type Items<T> = Item<T>[];

type ListItemProps<T> = {
    item: Item<T>;
    selectCallback: (item: Item<T>) => void;
    genContent: (item: Item<T>) => React.ReactNode;
    itemClassName?: string;
}

function ListItem<T>(props: ListItemProps<T>) {
    const item = props.item;
    const onClick = () => {
        props.selectCallback(item);
    }
    return <li
        className={`${props.itemClassName} shadow my-2 py-2 px-2 sm:py-2 hover:bg-slate-100 ${item.selected ? "text-blue-600/100 bg-slate-100" : ""}`}
        onClick={onClick}>
        {props.genContent(item)}
    </li>;
}


type ListProps<T> = {
    items: Items<T>;
    setItems: (items: Items<T>) => void;
    selectCallback?: (item: Item<T>) => void;
    genContent: (item: Item<T>) => React.ReactNode;
    className?: string;
    itemClassName?: string;
}

export function List<T>(props: ListProps<T>) {
    const handleClick = (ele: Item<T>) => {
        const newItems = props.items.map(item => {
            if (item.id === ele.id) {
                item.selected = true;
            } else {
                item.selected = false;
            }
            return item;
        })
        props.setItems(newItems);
        if (props.selectCallback) {
            props.selectCallback(ele);
        }
    }
    return (
        <ul role="list" className={props.className}>
            {props.items.map((ele) =>
                <ListItem key={ele.id}
                    item={ele} selectCallback={handleClick}
                    genContent={props.genContent}
                    itemClassName={props.itemClassName} />
            )}
        </ul>
    );
}