<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Sunat;

use Greenter\Model\Response\BillResult;

final class SunatInvoiceSubmissionResult
{
    /** @var bool */
    private $success;

    /** @var string|null */
    private $cdrCode;

    /** @var string|null */
    private $cdrDescription;

    /** @var string[] */
    private $cdrNotes;

    /** @var string|null */
    private $cdrZip;

    /** @var string|null */
    private $errorCode;

    /** @var string|null */
    private $errorMessage;

    /**
     * @param string[] $cdrNotes
     */
    private function __construct(
        bool $success,
        ?string $cdrCode,
        ?string $cdrDescription,
        array $cdrNotes,
        ?string $cdrZip,
        ?string $errorCode,
        ?string $errorMessage
    ) {
        $this->success = $success;
        $this->cdrCode = $cdrCode;
        $this->cdrDescription = $cdrDescription;
        $this->cdrNotes = $cdrNotes;
        $this->cdrZip = $cdrZip;
        $this->errorCode = $errorCode;
        $this->errorMessage = $errorMessage;
    }

    public static function fromBillResult(BillResult $result): self
    {
        $cdr = $result->getCdrResponse();
        $error = $result->getError();

        return new self(
            $result->isSuccess() === true,
            $cdr ? $cdr->getCode() : null,
            $cdr ? $cdr->getDescription() : null,
            $cdr ? ($cdr->getNotes() ?: []) : [],
            $result->getCdrZip(),
            $error ? $error->getCode() : null,
            $error ? $error->getMessage() : null
        );
    }

    public function success(): bool
    {
        return $this->success;
    }

    public function cdrCode(): ?string
    {
        return $this->cdrCode;
    }

    public function cdrDescription(): ?string
    {
        return $this->cdrDescription;
    }

    /**
     * @return string[]
     */
    public function cdrNotes(): array
    {
        return $this->cdrNotes;
    }

    public function cdrZip(): ?string
    {
        return $this->cdrZip;
    }

    public function errorCode(): ?string
    {
        return $this->errorCode;
    }

    public function errorMessage(): ?string
    {
        return $this->errorMessage;
    }
}
