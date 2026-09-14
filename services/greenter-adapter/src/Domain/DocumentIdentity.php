<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Domain;

final class DocumentIdentity
{
    public string $type;
    public string $serie;
    public int $number;
    public string $currency;
    public string $issueDate;

    public function __construct(string $type, string $serie, int $number, string $currency, string $issueDate)
    {
        $this->type = $type;
        $this->serie = $serie;
        $this->number = $number;
        $this->currency = $currency;
        $this->issueDate = $issueDate;
    }
}
