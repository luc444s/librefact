<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Validation;

final class EmitDocumentPayloadValidator
{
    private const TOLERANCE = 0.01;

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array{field:string, message:string}>
     */
    public function validate(array $payload): array
    {
        $errors = [];

        $taxAuthority = $this->section($payload, 'tax_authority', $errors);
        if ($taxAuthority !== null) {
            $this->requiredEquals($taxAuthority, 'tax_authority.country', 'PE', $errors);
            $this->requiredEquals($taxAuthority, 'tax_authority.code', 'SUNAT', $errors);
            $this->requiredEquals($taxAuthority, 'tax_authority.provider', 'greenter', $errors);
        }

        $document = $this->section($payload, 'document', $errors);
        if ($document !== null) {
            $this->requiredEquals($document, 'document.type', 'invoice', $errors);
            $this->requiredNonEmpty($document, 'document.serie', $errors);
            $this->requiredNumber($document, 'document.number', 0.0, false, $errors);
            $this->requiredEquals($document, 'document.currency', 'PEN', $errors);
            $this->requiredDate($document, 'document.issue_date', $errors);
        }

        $issuer = $this->section($payload, 'issuer', $errors);
        if ($issuer !== null) {
            $this->requiredDigits($issuer, 'issuer.ruc', 11, $errors);
            $this->requiredNonEmpty($issuer, 'issuer.legal_name', $errors);
        }

        $customer = $this->section($payload, 'customer', $errors);
        if ($customer !== null) {
            $this->requiredEquals($customer, 'customer.document_type', '6', $errors);
            $this->requiredDigits($customer, 'customer.document_number', 11, $errors);
            $this->requiredNonEmpty($customer, 'customer.legal_name', $errors);
        }

        $this->validateItems($payload, $errors);
        $this->validateTotals($payload, $errors);

        return $errors;
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, array{field:string, message:string}> $errors
     * @return array<string, mixed>|null
     */
    private function section(array $payload, string $field, array &$errors): ?array
    {
        if (!array_key_exists($field, $payload)) {
            $this->addError($errors, $field, $field . ' is required');

            return null;
        }

        if (!is_array($payload[$field])) {
            $this->addError($errors, $field, $field . ' must be an object');

            return null;
        }

        return $payload[$field];
    }

    /**
     * @param array<string, mixed> $section
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function requiredEquals(array $section, string $field, string $expected, array &$errors): void
    {
        $key = $this->lastSegment($field);
        if (!array_key_exists($key, $section)) {
            $this->addError($errors, $field, $field . ' is required');

            return;
        }

        if ($section[$key] !== $expected) {
            $this->addError($errors, $field, $field . ' must equal ' . $expected);
        }
    }

    /**
     * @param array<string, mixed> $section
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function requiredNonEmpty(array $section, string $field, array &$errors): void
    {
        $key = $this->lastSegment($field);
        if (!array_key_exists($key, $section)) {
            $this->addError($errors, $field, $field . ' is required');

            return;
        }

        if (!is_string($section[$key]) || trim($section[$key]) === '') {
            $this->addError($errors, $field, $field . ' must be non-empty');
        }
    }

    /**
     * @param array<string, mixed> $section
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function requiredDigits(array $section, string $field, int $length, array &$errors): void
    {
        $key = $this->lastSegment($field);
        if (!array_key_exists($key, $section)) {
            $this->addError($errors, $field, $field . ' is required');

            return;
        }

        if (!is_string($section[$key]) || preg_match('/^\d{' . $length . '}$/', $section[$key]) !== 1) {
            $this->addError($errors, $field, $field . ' must be exactly ' . $length . ' digits');
        }
    }

    /**
     * @param array<string, mixed> $section
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function requiredNumber(
        array $section,
        string $field,
        float $minimum,
        bool $allowMinimum,
        array &$errors
    ): void {
        $key = $this->lastSegment($field);
        if (!array_key_exists($key, $section)) {
            $this->addError($errors, $field, $field . ' is required');

            return;
        }

        if (!is_int($section[$key]) && !is_float($section[$key])) {
            $this->addError($errors, $field, $field . ' must be numeric');

            return;
        }

        $value = (float) $section[$key];
        if ($allowMinimum ? $value < $minimum : $value <= $minimum) {
            $comparison = $allowMinimum ? 'greater than or equal to ' : 'greater than ';
            $this->addError($errors, $field, $field . ' must be ' . $comparison . $this->formatNumber($minimum));
        }
    }

    /**
     * @param array<string, mixed> $section
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function requiredDate(array $section, string $field, array &$errors): void
    {
        $key = $this->lastSegment($field);
        if (!array_key_exists($key, $section)) {
            $this->addError($errors, $field, $field . ' is required');

            return;
        }

        if (!is_string($section[$key]) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $section[$key]) !== 1) {
            $this->addError($errors, $field, $field . ' must match YYYY-MM-DD');
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function validateItems(array $payload, array &$errors): void
    {
        if (!array_key_exists('items', $payload)) {
            $this->addError($errors, 'items', 'items is required');

            return;
        }

        if (!is_array($payload['items']) || $payload['items'] === []) {
            $this->addError($errors, 'items', 'items must be a non-empty array');

            return;
        }

        foreach ($payload['items'] as $index => $item) {
            $field = 'items[' . $index . ']';
            if (!is_array($item)) {
                $this->addError($errors, $field, $field . ' must be an object');

                continue;
            }

            $this->requiredNonEmpty($item, $field . '.description', $errors);
            $this->requiredNumber($item, $field . '.quantity', 0.0, false, $errors);
            $this->requiredNumber($item, $field . '.unit_value', 0.0, true, $errors);
            $this->requiredNumber($item, $field . '.igv', 0.0, true, $errors);
            $this->requiredNumber($item, $field . '.total', 0.0, true, $errors);

            if (
                $this->isNumber($item['quantity'] ?? null)
                && $this->isNumber($item['unit_value'] ?? null)
                && $this->isNumber($item['igv'] ?? null)
                && $this->isNumber($item['total'] ?? null)
            ) {
                $expected = ((float) $item['unit_value'] * (float) $item['quantity']) + (float) $item['igv'];
                if (!$this->matches((float) $item['total'], $expected)) {
                    $this->addError($errors, $field . '.total', $field . '.total must equal unit_value * quantity + igv');
                }
            }
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function validateTotals(array $payload, array &$errors): void
    {
        $totals = $this->section($payload, 'totals', $errors);
        if ($totals === null) {
            return;
        }

        $this->requiredNumber($totals, 'totals.taxable', 0.0, true, $errors);
        $this->requiredNumber($totals, 'totals.igv', 0.0, true, $errors);
        $this->requiredNumber($totals, 'totals.total', 0.0, false, $errors);

        if (
            $this->isNumber($totals['taxable'] ?? null)
            && $this->isNumber($totals['igv'] ?? null)
            && $this->isNumber($totals['total'] ?? null)
        ) {
            $expected = (float) $totals['taxable'] + (float) $totals['igv'];
            if (!$this->matches((float) $totals['total'], $expected)) {
                $this->addError($errors, 'totals.total', 'totals.total must equal totals.taxable + totals.igv');
            }
        }
    }

    private function lastSegment(string $field): string
    {
        $segments = explode('.', $field);

        return $segments[count($segments) - 1];
    }

    private function isNumber($value): bool
    {
        return is_int($value) || is_float($value);
    }

    private function matches(float $actual, float $expected): bool
    {
        return abs($actual - $expected) <= self::TOLERANCE;
    }

    private function formatNumber(float $number): string
    {
        return rtrim(rtrim((string) $number, '0'), '.');
    }

    /**
     * @param array<int, array{field:string, message:string}> $errors
     */
    private function addError(array &$errors, string $field, string $message): void
    {
        $errors[] = [
            'field' => $field,
            'message' => $message,
        ];
    }
}
