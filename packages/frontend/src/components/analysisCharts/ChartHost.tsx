import { useEffect, useRef, useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Skeleton,
  Box,
} from '@chakra-ui/react';
import { MoreHorizontal, Download, EyeOff } from 'lucide-react';
import type { ChartDescriptor } from './registry';
import type { ChartContext } from './ChartContext';

interface ChartHostProps {
  descriptor: ChartDescriptor;
  ctx: ChartContext;
  onHide: (id: string) => void;
}

/**
 * Wraps a single ChartDescriptor in a Chakra Card. Returns null when the
 * descriptor's data isn't available, so callers can just `.map()` over the
 * full registry without guards.
 */
export function ChartHost({ descriptor, ctx, onHide }: ChartHostProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hasIntersected, setHasIntersected] = useState(false);

  // IntersectionObserver lazy mount — defer rendering of heavy chart bodies
  // until the card scrolls near the viewport. Once mounted, stays mounted.
  useEffect(() => {
    if (hasIntersected) return;
    const node = cardRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setHasIntersected(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasIntersected(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasIntersected]);

  if (!descriptor.isAvailable(ctx)) return null;

  const handleDownloadPng = async () => {
    const node = cardRef.current;
    if (!node) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${descriptor.id}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      console.error('PNG export failed', err);
    }
  };

  return (
    <Card ref={cardRef}>
      <CardHeader pb={2}>
        <HStack justify="space-between" align="start">
          <Heading size="sm">{descriptor.title}</Heading>
          <Menu placement="bottom-end" isLazy>
            <MenuButton
              as={IconButton}
              aria-label={`Card menu for ${descriptor.title}`}
              icon={<MoreHorizontal size={14} />}
              size="xs"
              variant="ghost"
            />
            <MenuList minW="160px">
              <MenuItem icon={<Download size={14} />} fontSize="sm" onClick={handleDownloadPng}>
                Download PNG
              </MenuItem>
              <MenuItem
                icon={<EyeOff size={14} />}
                fontSize="sm"
                onClick={() => onHide(descriptor.id)}
              >
                Hide chart
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </CardHeader>
      <CardBody pt={2}>
        {hasIntersected ? (
          descriptor.render(ctx)
        ) : (
          <Box minH="200px">
            <Skeleton height="200px" borderRadius="md" />
          </Box>
        )}
      </CardBody>
    </Card>
  );
}
