import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverHeader,
  PopoverBody,
  HStack,
  Box,
  Text,
} from '@chakra-ui/react';
import { Info } from 'lucide-react';
import { lookupTerm } from '../utils/glossary';

interface TermInfoProps {
  term: string;
  /** Optional override for the displayed label (defaults to glossary label or term). */
  label?: string;
  /** Render only the icon (no label). */
  iconOnly?: boolean;
}

/**
 * Inline, accessible glossary marker. Wraps a term in a hover/click popover
 * showing its short definition. If the term isn't in the glossary, renders
 * the label without an icon (graceful fallback).
 */
export function TermInfo({ term, label, iconOnly = false }: TermInfoProps) {
  const entry = lookupTerm(term);
  const display = label ?? entry?.label ?? term;

  if (!entry) {
    return iconOnly ? null : <Text as="span">{display}</Text>;
  }

  return (
    <Popover trigger="hover" placement="top" openDelay={150} isLazy>
      <PopoverTrigger>
        <HStack
          as="span"
          spacing={0.5}
          display="inline-flex"
          cursor="help"
          color="inherit"
          _hover={{ color: 'blue.600' }}
        >
          {!iconOnly && <Text as="span">{display}</Text>}
          <Box as={Info} boxSize="0.85em" color="blue.500" />
        </HStack>
      </PopoverTrigger>
      <PopoverContent maxW="320px">
        <PopoverArrow />
        <PopoverHeader fontSize="sm" fontWeight="bold">
          {entry.label}
        </PopoverHeader>
        <PopoverBody fontSize="xs" color="gray.700">
          {entry.short}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
