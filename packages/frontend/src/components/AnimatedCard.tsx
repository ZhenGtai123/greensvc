import { Card } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const MotionBox = motion.create('div' as const);

interface AnimatedCardProps {
  children: ReactNode;
  hoverable?: boolean;
  delay?: number;
  [key: string]: unknown;
}

function AnimatedCard({ children, hoverable, delay = 0, ...rest }: AnimatedCardProps) {
  return (
    <MotionBox
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      {...(hoverable
        ? {
            whileHover: { y: -2, boxShadow: '0 4px 6px -2px rgba(0,0,0,0.04), 0 10px 15px -3px rgba(0,0,0,0.06)' },
            style: { cursor: 'pointer' },
          }
        : {})}
    >
      <Card h="full" {...rest}>
        {children}
      </Card>
    </MotionBox>
  );
}

export default AnimatedCard;
