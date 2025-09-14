import React from 'react';
import './Skeleton.css';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    className?: string;
    circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    width = '100%',
    height = '1rem',
    className = '',
    circle = false
}) => {
    const style = {
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: circle ? '50%' : '4px'
    };

    return (
        <div
            className={`skeleton-loader ${className}`}
            style={style}
        />
    );
};

export const SkeletonText: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
    <div className="skeleton-text">
        {Array.from({ length: lines }, (_, i) => (
            <Skeleton
                key={i}
                width={`${Math.random() * 40 + 60}%`}
                height="1rem"
                className="skeleton-text-line"
            />
        ))}
    </div>
);