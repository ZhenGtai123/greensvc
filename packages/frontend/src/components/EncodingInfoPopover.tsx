import { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  IconButton,
  VStack,
  HStack,
  Box,
  Text,
  Badge,
  Button,
  Collapse,
  Link,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react';
import { Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { EncodingEntry } from '../types';

interface EncodingInfoPopoverProps {
  title: string;
  entries: EncodingEntry[] | undefined;
  selectedCode?: string;
  /** Tooltip on the trigger icon. Defaults to "View knowledge-base reference". */
  triggerTooltip?: string;
}

function PaperList({ papers }: { papers: EncodingEntry['supporting_papers'] }) {
  const [open, setOpen] = useState(false);
  if (!papers || papers.length === 0) {
    return <Text fontSize="xs" color="gray.400">No supporting papers recorded.</Text>;
  }
  return (
    <Box>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        rightIcon={open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      >
        Supporting papers ({papers.length})
      </Button>
      <Collapse in={open} animateOpacity>
        <VStack align="stretch" spacing={2} mt={2} pl={2} borderLeftWidth={2} borderColor="gray.200">
          {papers.map((p, idx) => (
            <Box key={`${p.doi || p.paper_file || idx}`} fontSize="xs">
              <Text color="gray.700">{p.citation || p.paper_file || 'Unnamed source'}</Text>
              {p.doi && (
                <Link
                  href={`https://doi.org/${p.doi}`}
                  isExternal
                  color="blue.600"
                  fontSize="xs"
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                  mt={0.5}
                >
                  doi:{p.doi} <ExternalLink size={10} />
                </Link>
              )}
            </Box>
          ))}
        </VStack>
      </Collapse>
    </Box>
  );
}

function EncodingInfoPopover({
  title,
  entries,
  selectedCode,
  triggerTooltip = 'View knowledge-base reference',
}: EncodingInfoPopoverProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const disabled = !entries || entries.length === 0;

  return (
    <>
      <Tooltip label={triggerTooltip} placement="top" hasArrow>
        <IconButton
          aria-label={triggerTooltip}
          icon={<Info size={14} />}
          size="xs"
          variant="ghost"
          colorScheme="blue"
          onClick={onOpen}
          isDisabled={disabled}
        />
      </Tooltip>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Text>{title}</Text>
              <Badge colorScheme="gray" fontWeight="normal">
                {entries?.length ?? 0} entries
              </Badge>
            </HStack>
            <Text fontSize="xs" color="gray.500" fontWeight="normal" mt={1}>
              Definitions and supporting literature from the SceneRx knowledge-base codebook.
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack align="stretch" spacing={4}>
              {(entries || []).map((entry) => {
                const isSelected = entry.code === selectedCode;
                return (
                  <Box
                    key={entry.code}
                    p={3}
                    borderWidth={1}
                    borderRadius="md"
                    borderColor={isSelected ? 'blue.400' : 'gray.200'}
                    bg={isSelected ? 'blue.50' : 'white'}
                  >
                    <HStack mb={1} spacing={2} flexWrap="wrap">
                      <Text fontWeight="bold" fontSize="sm">
                        {entry.name}
                      </Text>
                      <Badge colorScheme={isSelected ? 'blue' : 'gray'} fontSize="2xs">
                        {entry.code}
                      </Badge>
                      {isSelected && (
                        <Badge colorScheme="green" fontSize="2xs">
                          selected
                        </Badge>
                      )}
                    </HStack>
                    {entry.definition ? (
                      <Text fontSize="xs" color="gray.700" mb={2}>
                        {entry.definition}
                      </Text>
                    ) : (
                      <Text fontSize="xs" color="gray.400" fontStyle="italic" mb={2}>
                        No definition recorded.
                      </Text>
                    )}
                    <PaperList papers={entry.supporting_papers} />
                  </Box>
                );
              })}
              {(!entries || entries.length === 0) && (
                <Text fontSize="sm" color="gray.500">
                  No entries available.
                </Text>
              )}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

export default EncodingInfoPopover;
