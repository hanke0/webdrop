import React from "react"

type CardProps = {
    children: React.ReactNode;
    className?: string;
}

export function Card(props: CardProps) {
    return (
        <>
            <div className={`shadow-lg bg-white px-2 py-4 sm:px-2 lg:px-4 border rounded-lg ${props.className}`}>
                {props.children}
            </div>
        </>
    )
}