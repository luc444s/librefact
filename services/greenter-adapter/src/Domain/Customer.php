<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class Customer
{
    public string $documentType;
    public string $documentNumber;
    public string $legalName;

    public function __construct(string $documentType, string $documentNumber, string $legalName)
    {
        $this->documentType = $documentType;
        $this->documentNumber = $documentNumber;
        $this->legalName = $legalName;
    }
}
